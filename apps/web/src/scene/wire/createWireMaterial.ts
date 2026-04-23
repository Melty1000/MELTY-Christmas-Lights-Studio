import { Color, DoubleSide, ShaderMaterial, Uniform, Vector3 } from 'three';

// ---------------------------------------------------------------------------
// Wire strand shader (view-aligned ribbon + real braid weave)
// ---------------------------------------------------------------------------
//
// Each wire is rendered as a thin billboarded ribbon whose geometry is a
// row of duplicated vertices at the curve center. The vertex shader does
// two things with those center points every frame:
//
//   1. Width extrusion.  Each vert is pushed along
//      `perp = normalize(cross(tangent, viewDir))` by ±uThickness, so the
//      ribbon's flat face always points at the camera ("no thin edge of
//      paper" at any zoom/angle).
//
//   2. Weave depth.  Strand A and strand B are provided at π-offset phases
//      (see Scene.tsx). We add `sin(u·twists + uPhase) · uWeaveDepth`
//      along the view axis so the two strands physically move forward
//      and back through each other in screen-space and actually appear to
//      cross over — the cheap fragment-only spiral was printing the weave
//      on two flat overlapping quads, which is what made the cord read as
//      "jagged spirals" instead of "two rope twists".
//
// The fragment shader then fakes a rounded cylindrical cross-section and
// anti-aliases the helix groove using `fwidth()` so it never moirés at
// range. `alphaToCoverage` is enabled so the silhouette gets free MSAA
// smoothing in addition to the per-fragment AA, without having to make
// the material transparent (which would put it in the transparent pass
// and re-introduce the bulb-occlusion bug).
export function createWireMaterial(
  baseColorHex: number,
  twistPhase = 0,
  strandId: 0 | 1 = 0,
): ShaderMaterial {
  // IMPORTANT: Three.js's WebGLUniforms setter for `uniform vec3` is
  // `setValueV3f`, which checks for `v.x`/`v.y`/`v.z` (Vector3) or
  // `v.r`/`v.g`/`v.b` (Color). A plain `[r,g,b]` array passes neither
  // check and is silently ignored — the uniform stays at the shader's
  // default (0,0,0) and every wire renders pitch black. We use a
  // `THREE.Color` instance so the setter actually uploads the value.
  const baseColor = new Color(baseColorHex);
  // Opposite values on the two draw calls: breaks depth ties where the two
  // theme-colored ribbons intersect without depending on draw order.
  const poSign = strandId === 0 ? 1 : -1;

  return new ShaderMaterial({
    // WebGL: offset pushes the fragment a hair along the sloped depth — enough
    // to separate two slightly intersecting quads. Units scale with viewport.
    polygonOffset: true,
    polygonOffsetFactor: 0.55 * poSign,
    polygonOffsetUnits: 1.0 * poSign,
    uniforms: {
      uBaseColor: new Uniform(baseColor),
      uTwists: new Uniform(215),
      uAmbient: new Uniform(1.0),
      uGrooveStrength: new Uniform(0.55),
      uThickness: new Uniform(0.031),
      // Per-strand phase — wireA gets 0, wireB gets π. Drives both the
      // helix groove and the weave depth offset so the two strands stay
      // interlocked across the whole length.
      uPhase: new Uniform(twistPhase),
      // How far each strand bobs toward/away from the camera to sell the
      // braid crossover. Kept as a small multiple of thickness so it
      // scales sensibly when WIRE_THICKNESS changes. Too large and the
      // strands detach from the curve; too small and the weave flattens
      // back out into alpha overlap.
      uWeaveDepth: new Uniform(0.045),
      // Safety fallback for degenerate tangents (straight-up/down). The
      // cross(tangent, view) can collapse if they align, so we bias with
      // this world-space "up-ish" hint.
      uFallbackPerp: new Uniform(new Vector3(0, 1, 0)),
      // 0.0 / 1.0 — second strand gets a minuscule extra shift along
      // viewDir so the two meshes are never bit-identical at crossings even
      // with polygon offset disabled on some drivers.
      uStrandNudge: new Uniform(strandId === 0 ? 0.0 : 1.0),
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTangent;
      attribute float aSide;

      uniform float uThickness;
      uniform float uTwists;
      uniform float uPhase;
      uniform float uWeaveDepth;
      uniform vec3 uFallbackPerp;
      uniform float uStrandNudge;

      varying vec2 vUv;

      const float TAU = 6.28318530717958;

      void main() {
        vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
        vec3 worldPos = worldPos4.xyz;

        vec3 worldTangent = normalize(mat3(modelMatrix) * aTangent);
        vec3 viewDir = normalize(cameraPosition - worldPos);

        vec3 perp = cross(worldTangent, viewDir);
        float perpLen = length(perp);
        // Graceful fallback when tangent is parallel to view direction:
        // pick the component of the fallback perpendicular to tangent so
        // we still extrude perpendicularly to the wire.
        if (perpLen < 0.001) {
          perp = normalize(uFallbackPerp - worldTangent * dot(uFallbackPerp, worldTangent));
        } else {
          perp /= perpLen;
        }

        // Width extrusion along camera-aligned perpendicular.
        vec3 offset = perp * aSide * uThickness;

        // Weave depth: move this strand toward or away from the camera
        // sinusoidally along its length. Because strand A uses uPhase=0
        // and strand B uses uPhase=π, they always offset in opposite
        // directions and cross over every half-twist. This is what makes
        // the cord read as "two ropes twisting" instead of "a flat pair
        // of stripes".
        float twistPhase = uv.x * uTwists * TAU / 20.0 + uPhase;
        float weave = sin(twistPhase) * uWeaveDepth;
        // Strand B: constant forward bias so the two ropes never share one
        // depth plane (pairs with uStrandNudge in JS).
        vec3 weaveOffset = viewDir * (weave + uStrandNudge * 0.0009);

        // Where the two ribbon *halves* of the same strip meet (tight
        // dips / the “V” under a bulb) they are coplanar and can z-fight.
        // A tiny aSide shift along view nudges the left edge slightly
        // toward the camera and the right edge back — not visible as width,
        // but it separates fragment depths.
        float sideSep = 0.22 * uThickness;
        vec3 sideZ = viewDir * aSide * sideSep;

        vec4 displaced = vec4(worldPos + offset + weaveOffset + sideZ, 1.0);

        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * displaced;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBaseColor;
      uniform float uTwists;
      uniform float uAmbient;
      uniform float uGrooveStrength;
      uniform float uPhase;

      varying vec2 vUv;

      const float PI = 3.14159265358979;
      const float TAU = 6.28318530717958;

      // Groove density: tuned so that at default WIRE_TWISTS=215 you see
      // roughly one helix turn every ~3 bulb-spacings, which matches a
      // real heavy-gauge christmas cord. Baking the /20 here keeps the
      // vertex-side weave frequency and fragment-side helix frequency in
      // exact lockstep so the crossover and the groove line up visually.
      const float GROOVE_FREQ = 1.0 / 20.0;

      void main() {
        float u = vUv.x;
        float v = vUv.y;

        // ---------- Cylindrical cross-section shading ----------
        // Treat V=0.5 as the center of the cord (facing camera) and
        // V=0 / V=1 as the grazing edges. theta is the angular position
        // around the imaginary cylinder, so cos(theta) is effectively
        // n dot view for a cord whose axis lies along the tangent. This
        // is what gives the wire a real rounded look instead of a flat
        // strip with a sinewave over it.
        float theta = (v - 0.5) * PI;
        float ndotv = max(cos(theta), 0.0);
        float diffuse = pow(ndotv, 0.7);

        // ---------- AA helix groove ----------
        // Phase matches the vertex-side weave so ridges sit on the
        // outside of each crossover — this is why the braid reads as
        // physically coherent rope instead of a texture laid over a
        // quad. fwidth() expands the smoothstep edge by ~1 pixel of
        // parameter space so the groove never stair-steps at distance.
        float spiralPhase = u * uTwists * GROOVE_FREQ * TAU + uPhase + theta * 2.0;
        float spiral = sin(spiralPhase);
        float aa = max(fwidth(spiralPhase) * 0.8, 0.01);

        float ridge = smoothstep(0.75 - aa, 0.75 + aa, spiral);
        float groove = smoothstep(-0.75 + aa, -0.75 - aa, spiral);

        // ---------- Compose ----------
        float lighting = uAmbient * 0.35 + diffuse * 0.75;
        vec3 color = uBaseColor * lighting;

        // Metallic ridge highlight — tint bright with the base color so
        // silver/gold/copper themes still read as their hue on the
        // highlight rather than going pure white.
        color += mix(vec3(1.0), uBaseColor, 0.35) * ridge * 0.45 * diffuse;

        // Shadow groove — subtract on the opposite phase for depth. The
        // grooveStrength uniform is exposed so we can soften it on low
        // twist counts if we ever want to.
        color -= uBaseColor * groove * uGrooveStrength * 0.3;

        // Silhouette anti-alias. At the grazing edges (V near 0 or 1)
        // ndotv drops to zero; combined with alphaToCoverage below, MSAA
        // will dither-fade the last 1-2 pixels of the ribbon into the
        // background, eliminating the "jagged diagonal line" look that
        // plain quads have against thin-contrast backgrounds.
        float edgeAlpha = smoothstep(0.0, 0.05, ndotv);

        gl_FragColor = vec4(color, edgeAlpha);
      }
    `,
    // Wires are opaque physical cords. Keeping them in the opaque pass
    // avoids the transparent-sort-order bug where the wire ribbons (low
    // renderOrder) would write depth ahead of the bulb glass/socket
    // billboards (high renderOrder) and make every bulb render black.
    transparent: false,
    // alphaToCoverage turns the fragment's alpha channel into an MSAA
    // coverage mask — free sub-pixel silhouette AA on top of the
    // EffectComposer's MSAA pass, specifically useful for thin diagonal
    // wires where plain multisampling alone isn't enough.
    alphaToCoverage: true,
    depthWrite: true,
    side: DoubleSide,
  });
}
