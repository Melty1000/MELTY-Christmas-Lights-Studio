import { Curve, Vector3 } from 'three';

const _curveNormal = new Vector3();
const _curveBinormal = new Vector3();
const _offsetDir = new Vector3();
const _finalPos = new Vector3();
const _tempVec = new Vector3();
const _tangentPointA = new Vector3();
const _tangentPointB = new Vector3();

export type TwistedCurveFrameMode = 'AUTO' | 'PLANAR';

export class TwistedCurve extends Curve<Vector3> {
  baseCurve: Curve<Vector3>;
  offset: number;
  turns: number;
  phase: number;
  frameMode: TwistedCurveFrameMode;
  closed: boolean;

  constructor(
    baseCurve: Curve<Vector3>,
    offset: number,
    turns: number,
    phase: number,
    frameMode: TwistedCurveFrameMode = 'AUTO',
    closed = false,
  ) {
    super();
    this.baseCurve = baseCurve;
    this.offset = offset;
    this.turns = turns;
    this.phase = phase;
    this.frameMode = frameMode;
    this.closed = closed;
  }

  override getPoint(t: number, optionalTarget: Vector3 = new Vector3()): Vector3 {
    const curveT = this.closed ? wrapUnit(t) : t;
    const basePoint = this.baseCurve.getPoint(curveT);
    const tangent = this.baseCurve.getTangent(curveT).normalize();

    const normal = _curveNormal;
    const binormal = _curveBinormal;
    if (this.frameMode === 'PLANAR') {
      normal.set(-tangent.y, tangent.x, 0);
      if (normal.lengthSq() < 0.000001) normal.set(0, 1, 0);
      normal.normalize();
      binormal.set(0, 0, 1);
    } else {
      normal.set(0, 1, 0);
      if (Math.abs(tangent.y) > 0.99) normal.set(1, 0, 0);
      binormal.crossVectors(tangent, normal).normalize();
      normal.crossVectors(binormal, tangent).normalize();
    }

    const twistTurns = this.closed ? Math.round(this.turns) : this.turns;
    const twistAngle = curveT * twistTurns * Math.PI * 2 + this.phase;
    _offsetDir.copy(normal).multiplyScalar(Math.cos(twistAngle));
    _tempVec.copy(binormal).multiplyScalar(Math.sin(twistAngle));
    _offsetDir.add(_tempVec);

    _finalPos.copy(basePoint).addScaledVector(_offsetDir, this.offset);

    // The normal/binormal offset gives the pair a true helix around the base
    // curve. Do not add a second unrelated Z sine here; that makes the cord
    // read as overlapping waves instead of one strand wrapping over another.
    return optionalTarget.copy(_finalPos);
  }

  override getTangent(t: number, optionalTarget: Vector3 = new Vector3()): Vector3 {
    const delta = 0.0001;
    const beforeT = this.closed ? wrapUnit(t - delta) : Math.max(0, t - delta);
    const afterT = this.closed ? wrapUnit(t + delta) : Math.min(1, t + delta);

    this.getPoint(beforeT, _tangentPointA);
    this.getPoint(afterT, _tangentPointB);
    optionalTarget.copy(_tangentPointB).sub(_tangentPointA);

    if (optionalTarget.lengthSq() <= 0.000001) {
      return optionalTarget.set(1, 0, 0);
    }
    return optionalTarget.normalize();
  }
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}
