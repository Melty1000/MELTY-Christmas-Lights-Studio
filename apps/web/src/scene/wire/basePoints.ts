import { Vector3 } from 'three';

/**
 * Generate the base pin points for the Christmas-lights string.
 * This mirrors the legacy layout so the first R3F overlay pass keeps the
 * same overall framing and sag profile as the original app.
 *
 * `wireTwists` modulates a macro wobble in Y/Z along the string so the whole
 * cord (and bulbs) visibly undulates more as WIRE_TWISTS increases — the
 * micro-helix around the path still lives in TwistedCurve, but the centerline
 * was otherwise too straight in side view when twist was only in the helix.
 */
export function generateBasePoints(
  numPins: number,
  sagAmplitude: number,
  tension: number,
  wireTwists: number = 0,
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

  const n = points.length;
  if (n > 1 && wireTwists > 0) {
    const w = wireTwists / 100.0;
    // Amplitude and frequency both scale with the twist count so the
    // “candy-cane” undulation is obviously tied to the WIRE_TWISTS slider.
    const ampY = 0.04 * w * (0.35 + 0.65 * Math.min(1, sagAmplitude / 0.4));
    const ampZ = 0.03 * w * 0.8;
    const turnsAlong = 2.0 + w * 0.55;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const phaseY = 2.0 * Math.PI * u * turnsAlong;
      const phaseZ = 2.0 * Math.PI * u * turnsAlong * 0.86 + 0.9;
      const p = points[i]!;
      p.y += ampY * Math.sin(phaseY);
      p.z += ampZ * Math.sin(phaseZ);
    }
  }

  return points;
}
