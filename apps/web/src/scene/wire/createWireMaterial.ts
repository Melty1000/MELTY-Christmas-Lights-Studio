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
  // Whole-strand nudge in the camera-facing ribbon width (perp): pushes the
  // two theme wires apart in screen space at overlaps where helix + sin(weave)
  // would still line up. Opposite for A vs B.
  const strandLateral = strandId === 0 ? -1.0 : 1.0;

  return new ShaderMaterial({
    // WebGL: larger offset than the first pass — at shallow grazing angles
    // 0.55/factor 1.0u was still too weak to break ties.
    polygonOffset: true,
    polygonOffsetFactor: 1.25 * poSign,
    polygonOffsetUnits: 2.0 * poSign,
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
      uStrandLateral: new Uniform(strandLateral),
      // Per-twist view-space offset at full twist frequency (uTwists), in
      // addition to the slower groove weave. Scales in JS with thin wires.
      uPerTwistDepth: new Uniform(0.028),
      // Custom lighting (wire is ShaderMaterial; Three's lights are ignored
      // unless we sample them like this). Directions are world-space, toward
      // the light, normalized.
      uKeyL: new Uniform(new Vector3(0, 0.4, 0.3)),
      uKeyI: new Uniform(0.0),
      uFillL: new Uniform(new Vector3(-0.1, 0.3, -0.3)),
      uFillI: new Uniform(0.0),
      uHemiSky: new Uniform(new Color('#eef5ff')),
      uHemignd: new Uniform(new Color('#0a0a12')),
      uHemiI: new Uniform(0.0),
      uPPos0: new Uniform(new Vector3()),
      uPPos1: new Uniform(new Vector3()),
      uPPos2: new Uniform(new Vector3()),
      uPPos3: new Uniform(new Vector3()),
      uPPos4: new Uniform(new Vector3()),
      uPPos5: new Uniform(new Vector3()),
      uPPos6: new Uniform(new Vector3()),
      uPPos7: new Uniform(new Vector3()),
      uPCol0: new Uniform(new Color(0, 0, 0)),
      uPCol1: new Uniform(new Color(0, 0, 0)),
      uPCol2: new Uniform(new Color(0, 0, 0)),
      uPCol3: new Uniform(new Color(0, 0, 0)),
      uPCol4: new Uniform(new Color(0, 0, 0)),
      uPCol5: new Uniform(new Color(0, 0, 0)),
      uPCol6: new Uniform(new Color(0, 0, 0)),
      uPCol7: new Uniform(new Color(0, 0, 0)),
      uPCount: new Uniform(0),
      uPointRange: new Uniform(0.9),
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
      uniform float uStrandLateral;
      uniform float uPerTwistDepth;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vPerpW;

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

        // Constant shift of the whole ribbon along perp: separates strand A
        // and B in the *same* plane the slider uses to thicken the cable, so
        // where two 3D curve segments meet they are not the same sliver in
        // clip space. Scales with thickness so it stays sub-pixel subtle.
        vec3 strandPerp = perp * uStrandLateral * 0.42 * uThickness;

        // Weave depth: move this strand toward or away from the camera
        // sinusoidally along its length. Because strand A uses uPhase=0
        // and strand B uses uPhase=π, they always offset in opposite
        // directions and cross over every half-twist. This is what makes
        // the cord read as "two ropes twisting" instead of "a flat pair
        // of stripes".
        // Groove (slow along length): decimated uTwists for a stable texture.
        float twistPhase = uv.x * uTwists * TAU / 20.0 + uPhase;
        float weave = sin(twistPhase) * uWeaveDepth;
        // Per-twist depth: one “bucket” per full 1/turns of u — same
        // timescale as the 3D helix on the curve so crossings stagger in Z
        // from one twist to the next, not all on one depth slice.
        float nTw = max(uTwists, 0.0);
        float tTw = uv.x * nTw;
        float pt = TAU * tTw;
        float perTwist = sin(pt) * cos(0.5 * pt + uPhase);
        // Strand B: constant forward bias so the two ropes never share one
        // depth plane (pairs with uStrandNudge in JS).
        vec3 weaveOffset = viewDir * (
          weave
          + uStrandNudge * 0.0038
          + perTwist * uPerTwistDepth
        );

        // Where the two ribbon *halves* of the same strip meet (tight
        // dips / the “V” under a bulb) they are coplanar and can z-fight.
        // A tiny aSide shift along view nudges the left edge slightly
        // toward the camera and the right edge back — not visible as width,
        // but it separates fragment depths.
        float sideSep = 0.55 * uThickness;
        vec3 sideZ = viewDir * aSide * sideSep;

        vec4 displaced = vec4(
          worldPos + offset + strandPerp + weaveOffset + sideZ,
          1.0
        );

        vWorldPos = displaced.xyz;
        vPerpW = perp;

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
      uniform vec3 uKeyL;
      uniform float uKeyI;
      uniform vec3 uFillL;
      uniform float uFillI;
      uniform vec3 uHemiSky;
      uniform vec3 uHemignd;
      uniform float uHemiI;
      uniform vec3 uPPos0; uniform vec3 uPPos1; uniform vec3 uPPos2; uniform vec3 uPPos3;
      uniform vec3 uPPos4; uniform vec3 uPPos5; uniform vec3 uPPos6; uniform vec3 uPPos7;
      uniform vec3 uPCol0; uniform vec3 uPCol1; uniform vec3 uPCol2; uniform vec3 uPCol3;
      uniform vec3 uPCol4; uniform vec3 uPCol5; uniform vec3 uPCol6; uniform vec3 uPCol7;
      uniform float uPCount;
      uniform float uPointRange;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vPerpW;

      const float PI = 3.14159265358979;
      const float TAU = 6.28318530717958;

      // Groove density: tuned so that at default WIRE_TWISTS=215 you see
      // roughly one helix turn every ~3 bulb-spacings, which matches a
      // real heavy-gauge christmas cord. Baking the /20 here keeps the
      // vertex-side weave frequency and fragment-side helix frequency in
      // exact lockstep so the crossover and the groove line up visually.
      const float GROOVE_FREQ = 1.0 / 20.0;

      // Point lights: inverse-square, capped by range, colored spill ("reflections").
      vec3 pointTerm(vec3 wpos, vec3 lpos, vec3 lcol, vec3 n) {
        vec3 toL = lpos - wpos;
        float d2 = max(dot(toL, toL), 1e-4);
        float d = sqrt(d2);
        if (d > uPointRange) {
          return vec3(0.0);
        }
        vec3 L = toL / d;
        float nd = max(0.0, dot(n, L));
        float att = 1.0 / (0.2 + d2);
        return lcol * att * nd * 0.018;
      }

      void main() {
        float u = vUv.x;
        float v = vUv.y;

        vec3 V = normalize(cameraPosition - vWorldPos);
        float theta = (v - 0.5) * PI;
        float ndotv = max(cos(theta), 0.0);
        vec3 pW = normalize(vPerpW);
        vec3 nSurf = normalize(cos(theta) * V + sin(theta) * pW);
        if (ndotv < 0.001) nSurf = V;

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

        // ---------- Scene lights (key / fill / hemi) ----------
        float dirK = 0.55 * uKeyI * max(0.0, dot(nSurf, uKeyL));
        float dirF = 0.55 * uFillI * max(0.0, dot(nSurf, uFillL));
        vec3 hemiC = (uHemiSky * (0.5 + 0.5 * nSurf.y) + uHemignd * (0.5 - 0.5 * nSurf.y)) * (0.4 * uHemiI);
        float baseLight = uAmbient * 0.35 + diffuse * 0.75 + dirK + dirF;
        vec3 color = uBaseColor * (baseLight + hemiC);

        vec3 pAcc = step(0.5, uPCount) * pointTerm(vWorldPos, uPPos0, uPCol0, nSurf);
        pAcc += step(1.5, uPCount) * pointTerm(vWorldPos, uPPos1, uPCol1, nSurf);
        pAcc += step(2.5, uPCount) * pointTerm(vWorldPos, uPPos2, uPCol2, nSurf);
        pAcc += step(3.5, uPCount) * pointTerm(vWorldPos, uPPos3, uPCol3, nSurf);
        pAcc += step(4.5, uPCount) * pointTerm(vWorldPos, uPPos4, uPCol4, nSurf);
        pAcc += step(5.5, uPCount) * pointTerm(vWorldPos, uPPos5, uPCol5, nSurf);
        pAcc += step(6.5, uPCount) * pointTerm(vWorldPos, uPPos6, uPCol6, nSurf);
        pAcc += step(7.5, uPCount) * pointTerm(vWorldPos, uPPos7, uPCol7, nSurf);
        color += pAcc;

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
