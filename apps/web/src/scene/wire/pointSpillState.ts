import { Color, Vector3 } from 'three';

/** Buffers written by `BillboardBulbs` and read by wire `WireRibbon` the same frame. */
export const POINT_SPILL_MAX = 8;

const poolPos = () => new Vector3();
const poolCol = () => new Color();

export const pointSpillPos: Vector3[] = Array.from({ length: POINT_SPILL_MAX }, poolPos);
export const pointSpillCol: Color[] = Array.from({ length: POINT_SPILL_MAX }, poolCol);
export let pointSpillCount = 0;

export function beginPointSpillFrame(): void {
  pointSpillCount = 0;
}

export function pushPointSpill(
  x: number,
  y: number,
  z: number,
  colorHex: number,
  intensity: number,
): void {
  if (pointSpillCount >= POINT_SPILL_MAX) return;
  const i = pointSpillCount++;
  pointSpillPos[i]!.set(x, y, z);
  const c = pointSpillCol[i]!;
  c.setHex(colorHex);
  c.multiplyScalar(intensity);
}
