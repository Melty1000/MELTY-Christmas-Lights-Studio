const HALO_MAX_INTENSITY = 1.15;
const HALO_RESPONSE_CURVE = 3.2;
const BILLBOARD_WRAP_HALO_GAIN = 0.42;

export function computeBillboardHaloIntensity(
  strength: number,
  intensity: number,
  visibleLightIntensity: number,
): number {
  return computeHaloStrength(strength, intensity)
    * clamp01(visibleLightIntensity)
    * BILLBOARD_WRAP_HALO_GAIN;
}

export function billboardHaloIntensityForTest(
  strength: number,
  intensity: number,
  visibleLightIntensity: number,
): number {
  return computeBillboardHaloIntensity(strength, intensity, visibleLightIntensity);
}

function computeHaloStrength(strength: number, intensity: number): number {
  const raw = Math.max(0, strength) * Math.max(0, intensity);
  if (raw <= 0) return 0;
  return HALO_MAX_INTENSITY * (1 - Math.exp(-raw / HALO_RESPONSE_CURVE));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
