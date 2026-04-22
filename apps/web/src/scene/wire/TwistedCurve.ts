import { CatmullRomCurve3, Curve, Vector3 } from 'three';

const _curveNormal = new Vector3();
const _curveBinormal = new Vector3();
const _offsetDir = new Vector3();
const _finalPos = new Vector3();
const _tempVec = new Vector3();

export class TwistedCurve extends Curve<Vector3> {
  baseCurve: CatmullRomCurve3;
  offset: number;
  turns: number;
  phase: number;
  connects: number[];
  bypasses: number[];
  bulbScale: number;
  isBillboard: boolean;
  pinchRange: number;
  dipDepth: number;
  cornerSharpness = 8;
  socketRadius: number;
  bypassRadius: number;

  constructor(
    baseCurve: CatmullRomCurve3,
    offset: number,
    turns: number,
    phase: number,
    connects: number[] = [],
    bypasses: number[] = [],
    bulbScale = 0.1,
    isBillboard = false,
  ) {
    super();
    this.baseCurve = baseCurve;
    this.offset = offset;
    this.turns = turns;
    this.phase = phase;
    this.connects = connects;
    this.bypasses = bypasses;
    this.bulbScale = bulbScale;
    this.isBillboard = isBillboard;
    this.pinchRange = 0.003 + bulbScale * 0.015;
    this.dipDepth = 1.5 * bulbScale + offset;
    this.socketRadius = offset;
    this.bypassRadius = offset;
  }

  override getPoint(t: number, optionalTarget: Vector3 = new Vector3()): Vector3 {
    const basePoint = this.baseCurve.getPoint(t);
    const tangent = this.baseCurve.getTangent(t).normalize();

    const normal = _curveNormal.set(0, 1, 0);
    if (Math.abs(tangent.y) > 0.99) normal.set(1, 0, 0);
    const binormal = _curveBinormal.crossVectors(tangent, normal).normalize();
    normal.crossVectors(binormal, tangent).normalize();

    let influence = 0;
    let type: 'none' | 'connect' | 'bypass' = 'none';

    for (let i = 0; i < this.connects.length; i++) {
      const dist = Math.abs(t - this.connects[i]!);
      if (dist < this.pinchRange) {
        const x = 1 - dist / this.pinchRange;
        influence = Math.pow(x, this.cornerSharpness);
        type = 'connect';
        break;
      }
    }

    if (type === 'none') {
      for (let i = 0; i < this.bypasses.length; i++) {
        const dist = Math.abs(t - this.bypasses[i]!);
        if (dist < this.pinchRange) {
          const x = 1 - dist / this.pinchRange;
          influence = x * x * (3 - 2 * x);
          type = 'bypass';
          break;
        }
      }
    }

    const twistAngle = t * this.turns * Math.PI * 2 + this.phase;
    let cx = Math.cos(twistAngle);
    let cy = Math.sin(twistAngle);
    let radius = this.offset;
    let verticalOffset = 0;

    if (influence > 0) {
      if (type === 'connect') {
        verticalOffset = -this.dipDepth * influence;
      } else if (type === 'bypass') {
        radius = this.offset * (1 - influence) + this.bypassRadius * influence;
      }

      const length = Math.sqrt(cx * cx + cy * cy);
      if (length > 0.001) {
        cx /= length;
        cy /= length;
      }
    }

    if (type === 'connect' && influence > 0) {
      const horizontalDirection = _offsetDir.set(-tangent.z, 0, tangent.x).normalize();
      const sign = Math.cos(this.phase) > 0 ? 1 : -1;
      _offsetDir.copy(horizontalDirection).multiplyScalar(sign);

      const helixDirection = _tempVec.copy(normal).multiplyScalar(cx);
      helixDirection.addScaledVector(binormal, cy);

      _offsetDir.lerp(helixDirection, 1 - influence);
    } else {
      _offsetDir.copy(normal).multiplyScalar(cx);
      _tempVec.copy(binormal).multiplyScalar(cy);
      _offsetDir.add(_tempVec);
    }

    _finalPos.copy(basePoint).addScaledVector(_offsetDir, radius);
    if (verticalOffset !== 0) {
      _finalPos.y += verticalOffset;
    }

    if (this.isBillboard && type === 'connect' && influence > 0) {
      _finalPos.z = basePoint.z + 0.02 * influence;
    }

    return optionalTarget.copy(_finalPos);
  }
}
