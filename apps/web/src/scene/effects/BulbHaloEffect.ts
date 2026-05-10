import { BlendFunction, Effect } from 'postprocessing';
import {
  DataTexture,
  FloatType,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Uniform,
  Vector2,
} from 'three';
import {
  BULB_HALO_MAX,
  bulbHaloBasis,
  bulbHaloColor,
  bulbHaloCount,
  bulbHaloData,
  bulbHaloNeck,
} from './bulbHaloState.ts';
import { BULB_PROFILE, createBulbProfileMaskData } from '../bulbProfile.ts';
import { GLASS_SOCKET_OCCLUSION_Y } from '../bulbMetrics.ts';

const HALO_SOCKET_CONTINUITY_FLOOR = 0.14;
const HALO_SOCKET_FADE_START = -0.08;
const HALO_SOCKET_FADE_END = 0.2;
const HALO_SOCKET_ACROSS_LIFT = 0.07;
const HALO_GLASS_WRAP_FLOOR = 0.24;
const HALO_AURA_GAIN = 0.82;
const HALO_EDGE_GAIN = 0.3;
const HALO_EDGE_FADE_START = -0.005;
const HALO_EDGE_FADE_END = 0.09;

export function socketHaloContinuityForTest(alongMask: number, acrossMask: number): number {
  const eased = smoothstep(
    HALO_SOCKET_FADE_START,
    HALO_SOCKET_FADE_END,
    alongMask + Math.abs(acrossMask) * HALO_SOCKET_ACROSS_LIFT,
  );
  return HALO_SOCKET_CONTINUITY_FLOOR
    + (1 - HALO_SOCKET_CONTINUITY_FLOOR) * eased;
}

export function bulbHaloContributionForTest({
  aura,
  insideBulb,
  edgeAlpha,
  alongMask,
}: {
  aura: number;
  insideBulb: number;
  edgeAlpha: number;
  alongMask: number;
}): number {
  const glassWrap = 1 + (HALO_GLASS_WRAP_FLOOR - 1) * clamp01(insideBulb);
  const glassEdgeGlow = clamp01(edgeAlpha) * smoothstep(
    HALO_EDGE_FADE_START,
    HALO_EDGE_FADE_END,
    alongMask,
  );
  return Math.max(0, aura) * glassWrap * HALO_AURA_GAIN
    + glassEdgeGlow * HALO_EDGE_GAIN;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const fragmentShader = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uCount;
  uniform sampler2D uHaloTexture;
  uniform sampler2D uBulbMaskTexture;
  uniform float uEnabled;
  uniform float uStrength;
  uniform float uRadius;
  uniform float uIntensity;

  float bulbHaloMask(vec2 uv, vec4 data, vec4 basis, vec4 neckData) {
    vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 delta = (uv - data.xy) * aspect;
    vec2 edge = basis.xy * aspect;
    vec2 tip = basis.zw * aspect;
    vec2 neck = neckData.xy * aspect;
    vec2 neckToTip = tip - neck;

    float centerDenom = edge.x * tip.y - edge.y * tip.x;
    float neckDenom = edge.x * neckToTip.y - edge.y * neckToTip.x;
    if (abs(centerDenom) < 0.000001 || abs(neckDenom) < 0.000001) {
      return 0.0;
    }
    float acrossCenter = (delta.x * tip.y - delta.y * tip.x) / centerDenom;
    float alongCenter = (edge.x * delta.y - edge.y * delta.x) / centerDenom;

    vec2 deltaFromNeck = delta - neck;
    float acrossMask = (deltaFromNeck.x * neckToTip.y - deltaFromNeck.y * neckToTip.x) / neckDenom;
    float alongMask = (edge.x * deltaFromNeck.y - edge.y * deltaFromNeck.x) / neckDenom;

    float radiusControl = pow(clamp(uRadius, 0.0, 1.0), 1.35);
    vec2 localGlass = vec2(
      acrossMask * ${BULB_PROFILE.radiusX.toFixed(6)},
      ${GLASS_SOCKET_OCCLUSION_Y.toFixed(6)} + alongMask * ${(BULB_PROFILE.minY - GLASS_SOCKET_OCCLUSION_Y).toFixed(6)}
    );
    vec2 maskUv = vec2(
      (localGlass.x - ${BULB_PROFILE.minX.toFixed(6)}) / ${(BULB_PROFILE.maxX - BULB_PROFILE.minX).toFixed(6)},
      (localGlass.y - ${BULB_PROFILE.minY.toFixed(6)}) / ${(BULB_PROFILE.maxY - BULB_PROFILE.minY).toFixed(6)}
    );
    float inMaskBounds = step(0.0, maskUv.x)
      * step(maskUv.x, 1.0)
      * step(0.0, maskUv.y)
      * step(maskUv.y, 1.0);
    vec4 bulbMask = texture2D(uBulbMaskTexture, clamp(maskUv, vec2(0.0), vec2(1.0))) * inMaskBounds;

    float haloScale = mix(1.25, 28.0, radiusControl);
    float tipToEdgeRatio = length(tip) / max(length(edge), 0.000001);
    float along = alongCenter * tipToEdgeRatio / haloScale;
    float across = acrossCenter / haloScale;
    float haloDistance = sqrt(across * across * 2.05 + along * along * 1.16);
    float quickCore = exp(-haloDistance * 3.8);
    float longTail = 1.0 / pow(1.0 + haloDistance * 12.9, 1.95);
    float socketContinuity = mix(
      ${HALO_SOCKET_CONTINUITY_FLOOR.toFixed(6)},
      1.0,
      smoothstep(
        ${HALO_SOCKET_FADE_START.toFixed(6)},
        ${HALO_SOCKET_FADE_END.toFixed(6)},
        alongMask + abs(acrossMask) * ${HALO_SOCKET_ACROSS_LIFT.toFixed(6)}
      )
    );
    float aura = (quickCore * 0.34 + longTail * 0.66) * socketContinuity;
    float insideBulb = bulbMask.r;
    float glassWrap = mix(1.0, ${HALO_GLASS_WRAP_FLOOR.toFixed(6)}, insideBulb);
    float glassEdgeGlow = bulbMask.g * smoothstep(
      ${HALO_EDGE_FADE_START.toFixed(6)},
      ${HALO_EDGE_FADE_END.toFixed(6)},
      alongMask
    );
    return aura * glassWrap * ${HALO_AURA_GAIN.toFixed(6)}
      + glassEdgeGlow * ${HALO_EDGE_GAIN.toFixed(6)};
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 glow = vec3(0.0);
    float glowAlpha = 0.0;
    float strengthControl = pow(clamp(uStrength / 5.0, 0.0, 1.0), 1.1);
    float intensityControl = pow(clamp(uIntensity / 5.0, 0.0, 1.0), 0.85);
    float brightnessMultiplier = uEnabled * strengthControl * intensityControl * 8.0;
    float alphaMultiplier = uEnabled * intensityControl;

    for (int i = 0; i < ${BULB_HALO_MAX}; i++) {
      float fi = float(i);
      float emitterActive = step(fi + 0.5, uCount);
      float texX = (fi + 0.5) / ${BULB_HALO_MAX.toFixed(1)};
      vec4 data = texture2D(uHaloTexture, vec2(texX, 0.125));
      vec4 color = texture2D(uHaloTexture, vec2(texX, 0.375));
      vec4 basis = texture2D(uHaloTexture, vec2(texX, 0.625));
      vec4 neck = texture2D(uHaloTexture, vec2(texX, 0.875));
      float source = data.z;
      float thresholded = smoothstep(0.0, 0.22, source);
      float mask = bulbHaloMask(uv, data, basis, neck);
      float amount = emitterActive * thresholded * source * mask * brightnessMultiplier;
      glow += color.rgb * amount;
      glowAlpha = max(glowAlpha, amount * (0.18 + 0.55 * alphaMultiplier));
    }

    outputColor = vec4(inputColor.rgb + glow, max(inputColor.a, clamp(glowAlpha, 0.0, 1.0)));
  }
`;

interface BulbHaloParams {
  enabled: boolean;
  strength: number;
  radius: number;
  intensity: number;
  width: number;
  height: number;
}

export class BulbHaloEffect extends Effect {
  private readonly haloTexture: DataTexture;
  private readonly haloTextureData: Float32Array;
  private readonly bulbMaskTexture: DataTexture;

  constructor() {
    const haloTextureData = new Float32Array(BULB_HALO_MAX * 4 * 4);
    const haloTexture = new DataTexture(
      haloTextureData,
      BULB_HALO_MAX,
      4,
      RGBAFormat,
      FloatType,
    );
    haloTexture.minFilter = NearestFilter;
    haloTexture.magFilter = NearestFilter;
    haloTexture.generateMipmaps = false;
    haloTexture.needsUpdate = true;
    const bulbMask = createBulbProfileMaskData();
    const bulbMaskTexture = new DataTexture(
      bulbMask.data,
      bulbMask.width,
      bulbMask.height,
      RGBAFormat,
      UnsignedByteType,
    );
    bulbMaskTexture.minFilter = LinearFilter;
    bulbMaskTexture.magFilter = LinearFilter;
    bulbMaskTexture.generateMipmaps = false;
    bulbMaskTexture.needsUpdate = true;

    super('BulbHaloEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uResolution', new Uniform(new Vector2(1, 1))],
        ['uCount', new Uniform(0)],
        ['uHaloTexture', new Uniform(haloTexture)],
        ['uBulbMaskTexture', new Uniform(bulbMaskTexture)],
        ['uEnabled', new Uniform(0)],
        ['uStrength', new Uniform(0)],
        ['uRadius', new Uniform(0)],
        ['uIntensity', new Uniform(0)],
      ]),
    });

    this.haloTexture = haloTexture;
    this.haloTextureData = haloTextureData;
    this.bulbMaskTexture = bulbMaskTexture;
  }

  override dispose(): void {
    this.haloTexture.dispose();
    this.bulbMaskTexture.dispose();
    super.dispose();
  }

  sync(params: BulbHaloParams): void {
    const count = params.enabled ? Math.min(BULB_HALO_MAX, bulbHaloCount) : 0;
    this.uniforms.get('uEnabled')!.value = params.enabled ? 1 : 0;
    this.uniforms.get('uCount')!.value = count;
    this.uniforms.get('uStrength')!.value = params.strength;
    this.uniforms.get('uRadius')!.value = params.radius;
    this.uniforms.get('uIntensity')!.value = params.intensity;
    (this.uniforms.get('uResolution')!.value as Vector2).set(
      Math.max(1, params.width),
      Math.max(1, params.height),
    );

    const target = this.haloTextureData;
    for (let i = 0; i < count; i++) {
      const data = bulbHaloData[i]!;
      const color = bulbHaloColor[i]!;
      const basis = bulbHaloBasis[i]!;
      const neck = bulbHaloNeck[i]!;
      const dataOffset = i * 4;
      const colorOffset = (BULB_HALO_MAX + i) * 4;
      const basisOffset = (BULB_HALO_MAX * 2 + i) * 4;
      const neckOffset = (BULB_HALO_MAX * 3 + i) * 4;
      target[dataOffset] = data.x;
      target[dataOffset + 1] = data.y;
      target[dataOffset + 2] = data.z;
      target[dataOffset + 3] = data.w;
      target[colorOffset] = color.x;
      target[colorOffset + 1] = color.y;
      target[colorOffset + 2] = color.z;
      target[colorOffset + 3] = color.w;
      target[basisOffset] = basis.x;
      target[basisOffset + 1] = basis.y;
      target[basisOffset + 2] = basis.z;
      target[basisOffset + 3] = basis.w;
      target[neckOffset] = neck.x;
      target[neckOffset + 1] = neck.y;
      target[neckOffset + 2] = neck.z;
      target[neckOffset + 3] = neck.w;
    }
    this.haloTexture.needsUpdate = true;
  }
}
