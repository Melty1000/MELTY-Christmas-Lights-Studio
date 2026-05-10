import { Shape, Vector2 } from 'three';

export const BULB_PROFILE = {
  minX: -0.55,
  maxX: 0.55,
  minY: -2.6,
  maxY: 0,
  centerY: -1.3,
  radiusX: 0.55,
} as const;

export function createBulbGlassShape(): Shape {
  const glassShape = new Shape();
  glassShape.moveTo(-0.22, 0);
  glassShape.bezierCurveTo(-0.45, 0, -0.55, -0.5, -0.55, -0.9);
  glassShape.bezierCurveTo(-0.55, -1.5, -0.35, -2.2, 0.0, -2.6);
  glassShape.bezierCurveTo(0.35, -2.2, 0.55, -1.5, 0.55, -0.9);
  glassShape.bezierCurveTo(0.55, -0.5, 0.45, 0, 0.22, 0);
  glassShape.lineTo(-0.22, 0);
  return glassShape;
}

export function createBulbProfileMaskData(
  width = 96,
  height = 192,
): { data: Uint8Array; width: number; height: number } {
  const shape = createBulbGlassShape();
  const points = shape.getPoints(96);
  const data = new Uint8Array(width * height * 4);
  const profileWidth = BULB_PROFILE.maxX - BULB_PROFILE.minX;
  const profileHeight = BULB_PROFILE.maxY - BULB_PROFILE.minY;
  const aaWidth = profileWidth / width * 1.25;
  const edgeWidth = profileWidth / width * 3.0;

  for (let yIndex = 0; yIndex < height; yIndex++) {
    const y = BULB_PROFILE.minY + ((yIndex + 0.5) / height) * profileHeight;
    for (let xIndex = 0; xIndex < width; xIndex++) {
      const x = BULB_PROFILE.minX + ((xIndex + 0.5) / width) * profileWidth;
      const inside = pointInPolygon(x, y, points);
      const distance = distanceToPolyline(x, y, points);
      const signedDistance = inside ? distance : -distance;
      const insideAlpha = smoothstep(-aaWidth, aaWidth, signedDistance);
      const edgeAlpha = 1 - smoothstep(0, edgeWidth, Math.abs(signedDistance));
      const offset = (yIndex * width + xIndex) * 4;
      data[offset] = Math.round(insideAlpha * 255);
      data[offset + 1] = Math.round(edgeAlpha * 255);
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }
  }

  return { data, width, height };
}

function pointInPolygon(x: number, y: number, points: Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]!;
    const pj = points[j]!;
    const intersects = ((pi.y > y) !== (pj.y > y))
      && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToPolyline(x: number, y: number, points: Vector2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    best = Math.min(best, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 <= 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.hypot(dx, dy);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
