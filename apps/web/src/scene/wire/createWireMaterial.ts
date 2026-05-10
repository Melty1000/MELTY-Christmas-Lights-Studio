import { Color, DoubleSide, type IUniform, ShaderMaterial, Uniform, Vector3 } from 'three';
import { POINT_SPILL_MAX } from './pointSpillState.ts';

const POINT_SPILL_ACCUMULATION = Array.from(
  { length: POINT_SPILL_MAX },
  (_, index) => (
    `pAcc += step(${(index + 0.5).toFixed(1)}, uPCount) * pointTerm(vWorldPos, uPPos[${index}], uPCol[${index}], nSurf);`
  ),
).join('\n          ');

interface WireMaterialOptions {
  pointSpill?: boolean;
}

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
// applies only a subtle depth cue from the actual weave phase. Keeping the
// shadow tied to depth, not a painted spiral band, prevents harsh repeated
// stripes. `alphaToCoverage` is enabled so the silhouette gets free MSAA
// smoothing in addition to the per-fragment AA, without having to make the
// material transparent (which would put it in the transparent pass and
// re-introduce the bulb-occlusion bug).
export function createWireMaterial(
  baseColorHex: number,
  twistPhase = 0,
  strandId: 0 | 1 = 0,
  options: WireMaterialOptions = {},
): ShaderMaterial {
  // IMPORTANT: Three.js's WebGLUniforms setter for `uniform vec3` is
  // `setValueV3f`, which checks for `v.x`/`v.y`/`v.z` (Vector3) or
  // `v.r`/`v.g`/`v.b` (Color). A plain `[r,g,b]` array passes neither
  // check and is silently ignored — the uniform stays at the shader's
  // default (0,0,0) and every wire renders pitch black. We use a
  // `THREE.Color` instance so the setter actually uploads the value.
  const baseColor = new Color(baseColorHex);
  // Whole-strand nudge in the camera-facing ribbon width (perp): pushes the
  // two theme wires apart in screen space at overlaps where helix + sin(weave)
  // would still line up. Opposite for A vs B.
  const strandLateral = strandId === 0 ? -1.0 : 1.0;
  const pointSpillEnabled = options.pointSpill ?? true;

  const pointSpillUniforms: Record<string, IUniform> = pointSpillEnabled
    ? {
        uPPos: new Uniform(Array.from({ length: POINT_SPILL_MAX }, () => new Vector3())),
        uPCol: new Uniform(Array.from({ length: POINT_SPILL_MAX }, () => new Color(0, 0, 0))),
        uPCount: new Uniform(0),
        uPointRange: new Uniform(1.45),
      }
    : {};

  const pointSpillFragment = pointSpillEnabled
    ? /* glsl */ `
      uniform vec3 uPPos[${POINT_SPILL_MAX}];
      uniform vec3 uPCol[${POINT_SPILL_MAX}];
      uniform float uPCount;
      uniform float uPointRange;

      // Virtual bulb spill: inverse-square, capped by range, colored reflections.
      vec3 pointTerm(vec3 wpos, vec3 lpos, vec3 lcol, vec3 n) {
        vec3 toL = lpos - wpos;
        float d = length(toL);
        float range = max(uPointRange, 0.001);
        if (d > range) {
          return vec3(0.0);
        }
        vec3 L = toL / max(d, 0.0001);
        float nd = 0.35 + 0.65 * max(0.0, dot(n, L));
        float wireSpillFalloff = pow(max(0.0, 1.0 - d / range), 1.5);
        return lcol * wireSpillFalloff * nd * 0.05;
      }
    `
    : '';

  const pointSpillApply = pointSpillEnabled
    ? /* glsl */ `
        vec3 pAcc = vec3(0.0);
        ${POINT_SPILL_ACCUMULATION}

        float spillPeak = max(max(pAcc.r, pAcc.g), pAcc.b);
        vec3 spillTint = spillPeak <= 0.0001 ? vec3(0.0) : pAcc / spillPeak;
        vec3 spill = spillTint * (1.0 - exp(-spillPeak * 0.82));
        float baseLum = dot(uBaseColor, vec3(0.2126, 0.7152, 0.0722));
        float spillStrength = mix(0.095, 0.24, clamp(baseLum, 0.0, 1.0))
          * mix(1.0, 1.45, clamp(uMetalness, 0.0, 1.0));
        color += spill * spillStrength;
      `
    : '';

  return new ShaderMaterial({
    // Depth is handled by the actual helix phase, not by a static "strand A
    // always wins" polygon offset.
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
    uniforms: {
      uBaseColor: new Uniform(baseColor),
      uTwists: new Uniform(215),
      uAmbient: new Uniform(1.0),
      uFrontShadowStrength: new Uniform(0.2),
      uColorFloor: new Uniform(0.18),
      uExactColorMode: new Uniform(0.0),
      uMetalness: new Uniform(0.0),
      uStartTaper: new Uniform(0.0),
      uEndTaper: new Uniform(0.0),
      uTaperMinScale: new Uniform(1.0),
      uThickness: new Uniform(0.031),
      // Per-strand phase — wireA gets 0, wireB gets π. Drives the weave
      // depth offset so the two strands stay interlocked across the whole
      // length.
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
      uStrandLateral: new Uniform(strandLateral),
      uCollisionSpread: new Uniform(0.02),
      ...pointSpillUniforms,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aTangent;
      attribute float aSide;

      uniform float uThickness;
      uniform float uTwists;
      uniform float uPhase;
      uniform float uWeaveDepth;
      uniform vec3 uFallbackPerp;
      uniform float uStrandLateral;
      uniform float uCollisionSpread;
      uniform float uStartTaper;
      uniform float uEndTaper;
      uniform float uTaperMinScale;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vPerpW;
      varying float vHelixFront;
      varying float vTaper;

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

        float startTaper = uStartTaper <= 0.0
          ? 1.0
          : smoothstep(0.0, max(0.0001, uStartTaper), uv.x);
        float endTaper = uEndTaper <= 0.0
          ? 1.0
          : smoothstep(0.0, max(0.0001, uEndTaper), 1.0 - uv.x);
        float taper = min(startTaper, endTaper);
        float localThickness = uThickness * mix(clamp(uTaperMinScale, 0.0, 1.0), 1.0, taper);

        // Width extrusion along camera-aligned perpendicular.
        vec3 offset = perp * aSide * localThickness;

        // Constant shift of the whole ribbon along perp: separates strand A
        // and B in the *same* plane the slider uses to thicken the cable, so
        // where two 3D curve segments meet they are not the same sliver in
        // clip space. This is intentionally tiny now; the physical helix
        // radius and depth do the real separation.
        vec3 strandPerp = perp * uStrandLateral * uCollisionSpread;

        // Phase-accurate over/under depth. This uses the same full twist
        // frequency as TwistedCurve, so strand A and strand B alternate
        // front/back at every physical crossing instead of one strand always
        // winning the depth test.
        float helixPhase = uv.x * max(uTwists, 0.0) * TAU + uPhase;
        float helixFront = sin(helixPhase);
        vec3 weaveOffset = viewDir * helixFront * uWeaveDepth;

        // Where the two ribbon *halves* of the same strip meet (tight
        // dips / the “V” under a bulb) they are coplanar and can z-fight.
        // A tiny aSide shift along view nudges the left edge slightly
        // toward the camera and the right edge back — not visible as width,
        // but it separates fragment depths.
        float sideSep = 0.55 * localThickness;
        vec3 sideZ = viewDir * aSide * sideSep;

        vec4 displaced = vec4(
          worldPos + offset + strandPerp + weaveOffset + sideZ,
          1.0
        );

        vWorldPos = displaced.xyz;
        vPerpW = perp;
        vHelixFront = helixFront;
        vTaper = taper;

        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * displaced;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBaseColor;
      uniform float uAmbient;
      uniform float uFrontShadowStrength;
      uniform float uColorFloor;
      uniform float uExactColorMode;
      uniform float uMetalness;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vPerpW;
      varying float vHelixFront;
      varying float vTaper;

      const float PI = 3.14159265358979;

      ${pointSpillFragment}

      void main() {
        float v = vUv.y;

        vec3 V = normalize(cameraPosition - vWorldPos);
        float theta = (v - 0.5) * PI;
        float ndotv = max(cos(theta), 0.0);
        vec3 pW = normalize(vPerpW);
        vec3 nSurf = normalize(cos(theta) * V + sin(theta) * pW);
        if (ndotv < 0.001) nSurf = V;

        float diffuse = pow(ndotv, 0.7);

        if (uExactColorMode > 0.5) {
          float taperAlpha = smoothstep(0.0, 0.12, vTaper);
          float edgeAlpha = smoothstep(0.0, 0.05, ndotv) * taperAlpha;
          gl_FragColor = vec4(uBaseColor, edgeAlpha);
          return;
        }

        // ---------- Base wire form ----------
        // This intentionally stays close to the last known-good lighting
        // path: the cord has its own visibility from ambient + cylindrical
        // form, and bulb point spill only adds colored highlights.
        float baseLight = max(uColorFloor, uAmbient * 0.35 + diffuse * 0.75);
        vec3 color = uBaseColor * baseLight;

        ${pointSpillApply}

        // Soft body sheen. This gives the ribbon a rounded cord surface without
        // drawing a fake helical groove over the color.
        color += mix(vec3(1.0), uBaseColor, 0.72) * pow(diffuse, 2.4) * (0.055 + 0.045 * uMetalness);

        // Depth cue from the actual over/under weave. This is intentionally
        // weak: enough to show which strand is behind, not enough to read as
        // painted black stripes.
        float frontTone = clamp(0.5 + 0.5 * vHelixFront, 0.0, 1.0);
        float front = frontTone * frontTone * (3.0 - 2.0 * frontTone);
        float depthShade = mix(1.0 - uFrontShadowStrength * 0.18, 1.0, front);
        color *= depthShade;

        // Silhouette anti-alias. At the grazing edges (V near 0 or 1)
        // ndotv drops to zero; combined with alphaToCoverage below, MSAA
        // will dither-fade the last 1-2 pixels of the ribbon into the
        // background, eliminating the "jagged diagonal line" look that
        // plain quads have against thin-contrast backgrounds.
        float taperAlpha = smoothstep(0.0, 0.12, vTaper);
        float edgeAlpha = smoothstep(0.0, 0.05, ndotv) * mix(0.94, 1.0, front) * taperAlpha;

        gl_FragColor = vec4(max(color, vec3(0.01)), edgeAlpha);
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
