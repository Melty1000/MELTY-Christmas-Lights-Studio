import { Color, Vector4 } from 'three';

export const BULB_HALO_MAX = 96;

export const bulbHaloData = Array.from(
  { length: BULB_HALO_MAX },
  () => new Vector4(0, 0, 0, 0),
);

export const bulbHaloColor = Array.from(
  { length: BULB_HALO_MAX },
  () => new Vector4(0, 0, 0, 0),
);

export const bulbHaloBasis = Array.from(
  { length: BULB_HALO_MAX },
  () => new Vector4(0, 0, 0, 0),
);

export const bulbHaloNeck = Array.from(
  { length: BULB_HALO_MAX },
  () => new Vector4(0, 0, 0, 0),
);

const _color = new Color();

export let bulbHaloCount = 0;

export function beginBulbHaloFrame(): void {
  bulbHaloCount = 0;
}

export function pushBulbHalo(
  uvX: number,
  uvY: number,
  edgeUvX: number,
  edgeUvY: number,
  tipUvX: number,
  tipUvY: number,
  neckUvX: number,
  neckUvY: number,
  colorHex: number,
  intensity: number,
): void {
  if (bulbHaloCount >= BULB_HALO_MAX) return;
  if (
    !Number.isFinite(uvX)
    || !Number.isFinite(uvY)
    || !Number.isFinite(edgeUvX)
    || !Number.isFinite(edgeUvY)
    || !Number.isFinite(tipUvX)
    || !Number.isFinite(tipUvY)
    || !Number.isFinite(neckUvX)
    || !Number.isFinite(neckUvY)
    || !Number.isFinite(intensity)
  ) {
    return;
  }

  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  if (clampedIntensity <= 0) return;

  const edgeX = edgeUvX - uvX;
  const edgeY = edgeUvY - uvY;
  const tipX = tipUvX - uvX;
  const tipY = tipUvY - uvY;
  const neckX = neckUvX - uvX;
  const neckY = neckUvY - uvY;
  if (
    Math.hypot(edgeX, edgeY) <= 0.000001
    || Math.hypot(tipX, tipY) <= 0.000001
    || Math.hypot(tipX - neckX, tipY - neckY) <= 0.000001
  ) {
    return;
  }

  const index = bulbHaloCount++;
  bulbHaloData[index]!.set(uvX, uvY, clampedIntensity, 0);
  bulbHaloBasis[index]!.set(edgeX, edgeY, tipX, tipY);
  bulbHaloNeck[index]!.set(neckX, neckY, 0, 0);
  _color.setHex(colorHex);
  bulbHaloColor[index]!.set(_color.r, _color.g, _color.b, 0);
}
