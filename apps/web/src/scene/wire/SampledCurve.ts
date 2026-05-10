import { Curve, Vector3 } from 'three';

const EPSILON = 0.000001;
const TANGENT_SMOOTH_WORLD_DISTANCE = 2;
const MIN_TANGENT_WINDOW = 0.003;
const MAX_TANGENT_WINDOW = 0.05;
const _tangentBefore = new Vector3();
const _tangentAfter = new Vector3();

export class SampledCurve extends Curve<Vector3> {
  private readonly points: Vector3[];
  private readonly closed: boolean;
  private readonly cumulativeLengths: number[];
  private readonly totalLength: number;
  private readonly segmentCount: number;

  constructor(points: Vector3[], closed = false) {
    super();
    this.closed = closed;
    this.points = cleanPoints(points, closed);
    this.segmentCount = Math.max(0, closed ? this.points.length : this.points.length - 1);
    this.cumulativeLengths = [0];

    let totalLength = 0;
    for (let i = 0; i < this.segmentCount; i++) {
      const from = this.points[i]!;
      const to = this.points[(i + 1) % this.points.length]!;
      totalLength += from.distanceTo(to);
      this.cumulativeLengths.push(totalLength);
    }
    this.totalLength = totalLength;
  }

  override getPoint(t: number, optionalTarget: Vector3 = new Vector3()): Vector3 {
    if (this.points.length === 0) return optionalTarget.set(0, 0, 0);
    if (this.points.length === 1 || this.totalLength <= EPSILON || this.segmentCount <= 0) {
      return optionalTarget.copy(this.points[0]!);
    }

    const { segmentIndex, segmentT } = this.resolveSegment(t);
    return optionalTarget
      .copy(this.points[segmentIndex]!)
      .lerp(this.points[(segmentIndex + 1) % this.points.length]!, segmentT);
  }

  override getTangent(t: number, optionalTarget: Vector3 = new Vector3()): Vector3 {
    if (this.points.length < 2 || this.segmentCount <= 0) {
      return optionalTarget.set(1, 0, 0);
    }

    // Positions should stay exactly on the sampled path, but the frame that
    // drives the helix offset must ease through corners. Returning the raw
    // current segment direction makes the planar normal snap at every bridge
    // sample, which folds thick wires into visible corner knots.
    const window = Math.max(
      MIN_TANGENT_WINDOW,
      Math.min(MAX_TANGENT_WINDOW, TANGENT_SMOOTH_WORLD_DISTANCE / this.totalLength),
    );
    const beforeT = this.closed ? t - window : Math.max(0, t - window);
    const afterT = this.closed ? t + window : Math.min(1, t + window);

    this.getPoint(beforeT, _tangentBefore);
    this.getPoint(afterT, _tangentAfter);
    optionalTarget.copy(_tangentAfter).sub(_tangentBefore);

    if (optionalTarget.lengthSq() <= EPSILON) {
      const { segmentIndex } = this.resolveSegment(t);
      optionalTarget
        .copy(this.points[(segmentIndex + 1) % this.points.length]!)
        .sub(this.points[segmentIndex]!);
    }
    if (optionalTarget.lengthSq() <= EPSILON) {
      optionalTarget.set(1, 0, 0);
    }
    return optionalTarget.normalize();
  }

  override getLength(): number {
    return this.totalLength;
  }

  override getLengths(): number[] {
    return [...this.cumulativeLengths];
  }

  private resolveSegment(t: number): { segmentIndex: number; segmentT: number } {
    const normalizedT = this.closed
      ? ((t % 1) + 1) % 1
      : Math.max(0, Math.min(1, t));
    const distance = normalizedT * this.totalLength;

    if (!this.closed && normalizedT >= 1) {
      const lastSegment = Math.max(0, this.segmentCount - 1);
      return { segmentIndex: lastSegment, segmentT: 1 };
    }

    let low = 0;
    let high = this.segmentCount - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const start = this.cumulativeLengths[mid]!;
      const end = this.cumulativeLengths[mid + 1]!;
      if (distance < start) {
        high = mid - 1;
      } else if (distance > end) {
        low = mid + 1;
      } else {
        const segmentLength = Math.max(EPSILON, end - start);
        return {
          segmentIndex: mid,
          segmentT: Math.max(0, Math.min(1, (distance - start) / segmentLength)),
        };
      }
    }

    const fallbackSegment = Math.max(0, Math.min(this.segmentCount - 1, low));
    return { segmentIndex: fallbackSegment, segmentT: 0 };
  }
}

function cleanPoints(points: Vector3[], closed: boolean): Vector3[] {
  const cleaned: Vector3[] = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || previous.distanceTo(point) > EPSILON) {
      cleaned.push(point.clone());
    }
  }

  if (
    closed
    && cleaned.length > 1
    && cleaned[0]!.distanceTo(cleaned[cleaned.length - 1]!) <= EPSILON
  ) {
    cleaned.pop();
  }

  return cleaned;
}
