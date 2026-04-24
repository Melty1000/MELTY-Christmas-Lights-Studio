import { Vector3 } from 'three';

export function sampleBulbGuide(
  t: number,
  point: Vector3,
  target: Vector3,
  guidePoints: Vector3[] | undefined,
  optionalTarget: Vector3 = new Vector3(),
): Vector3 {
  if (guidePoints && guidePoints.length > 0) {
    if (guidePoints.length === 1) {
      optionalTarget.copy(guidePoints[0]!);
    } else {
      const scaled = Math.max(0, Math.min(guidePoints.length - 1, t * (guidePoints.length - 1)));
      const index = Math.min(guidePoints.length - 2, Math.floor(scaled));
      optionalTarget.copy(guidePoints[index]!).lerp(guidePoints[index + 1]!, scaled - index);
    }
  } else {
    optionalTarget.copy(target).sub(point);
  }

  optionalTarget.z = 0;
  if (optionalTarget.lengthSq() < 0.000001) {
    optionalTarget.set(0, -1, 0);
  } else {
    optionalTarget.normalize();
  }

  return optionalTarget;
}
