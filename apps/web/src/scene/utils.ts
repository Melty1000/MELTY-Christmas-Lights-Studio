import { Color, Curve, Vector3 } from 'three';

export function getBulbPalette(hex: number): { filament: Color; core: Color } {
  const color = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const isWhite = hsl.s < 0.2;
  const filament = isWhite
    ? new Color().setHSL(hsl.h, 0, 0.95)
    : new Color().setHSL(hsl.h, Math.max(0.8, hsl.s), 0.52);
  const core = isWhite
    ? new Color().setHSL(hsl.h, 0, 0.85)
    : new Color().setHSL(hsl.h, Math.max(0.9, hsl.s), 0.48);
  return { filament, core };
}

export class HelixCurve extends Curve<Vector3> {
  override getPoint(t: number, optionalTarget: Vector3 = new Vector3()): Vector3 {
    const turns = 6;
    const angle = t * Math.PI * 1.25 * turns;
    const radius = 0.2;
    const height = 1.25;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = t * height + 0.3;
    return optionalTarget.set(x, y, z);
  }
}

export function bulbTLocations(
  numPins: number,
  lightsPerSegment: number,
): number[] {
  return bulbTLocationsForSpans(numPins - 1, lightsPerSegment);
}

export function bulbTLocationsForSpans(
  spanCount: number,
  lightsPerSegment: number,
): number[] {
  const spans = Math.max(1, spanCount);
  const totalLights = spans * lightsPerSegment;
  const ts: number[] = [];
  const spanLen = 1 / spans;
  for (let s = 0; s < spans; s++) {
    const startT = s * spanLen;
    const slotSize = spanLen / lightsPerSegment;
    for (let i = 0; i < lightsPerSegment; i++) {
      ts.push(startT + slotSize * (i + 0.5));
    }
  }
  return ts.length === totalLights ? ts : ts;
}
