import { Vector3 } from 'three';

/**
 * Generate the base pin points for the Christmas-lights string.
 * This mirrors the legacy layout so the first R3F overlay pass keeps the
 * same overall framing and sag profile as the original app.
 */
export function generateBasePoints(
  numPins: number,
  sagAmplitude: number,
  tension: number,
): Vector3[] {
  const points: Vector3[] = [];
  const pinCount = Math.max(2, numPins);
  const totalWidth = 32;
  const startX = -16;
  const spacing = totalWidth / (pinCount - 1);
  const pinHeight = 4.5;
  const clampedTension = Math.max(-1, Math.min(1, tension));
  const blendFactor = Math.max(0, clampedTension);

  for (let i = 0; i < pinCount; i++) {
    const x = startX + (i * spacing);
    points.push(new Vector3(x, pinHeight, 0));

    if (i < pinCount - 1) {
      const segmentSteps = 12;

      for (let step = 1; step <= segmentSteps; step++) {
        const t = step / (segmentSteps + 1);
        const midX = x + (spacing * t);
        const parabola = 4 * t * (1 - t);
        const centerDist = Math.abs(t - 0.5) * 2;
        const catenary = 1 - Math.pow(centerDist, 0.5 + (blendFactor * 0.5));
        const dropAmount = (parabola * (1 - blendFactor)) + (catenary * blendFactor);
        const midY = pinHeight - (sagAmplitude * dropAmount);
        points.push(new Vector3(midX, midY, 0));
      }
    }
  }

  return points;
}
