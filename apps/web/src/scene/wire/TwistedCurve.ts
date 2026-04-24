import { CatmullRomCurve3, Curve, Vector3 } from 'three';

const _curveNormal = new Vector3();
const _curveBinormal = new Vector3();
const _offsetDir = new Vector3();
const _finalPos = new Vector3();
const _tempVec = new Vector3();
const _dipDir = new Vector3();
const _targetDelta = new Vector3();
const CONNECT_DIP_BULB_SCALE = 0.58;
const CONNECT_DIP_OFFSET_SCALE = 0.35;
const CONNECT_DIP_EXTRA_SEPARATION_SCALE = 0.35;

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
  bulbTarget: Vector3 | null;
  /** Z tuck at bulb joins (larger for thin wire); set from WIRE_THICKNESS in WireRibbon. */
  connectZBack = 0.04;

  constructor(
    baseCurve: CatmullRomCurve3,
    offset: number,
    turns: number,
    phase: number,
    connects: number[] = [],
    bypasses: number[] = [],
    bulbScale = 0.1,
    isBillboard = false,
    bulbTarget?: Vector3,
    separationCompensation = 0,
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
    this.bulbTarget = bulbTarget?.clone() ?? null;
    this.pinchRange = 0.003 + bulbScale * 0.015;
    const baseDipOffset = Math.max(0, offset - separationCompensation);
    this.dipDepth = (
      CONNECT_DIP_BULB_SCALE * bulbScale
      + CONNECT_DIP_OFFSET_SCALE * baseDipOffset
      + CONNECT_DIP_EXTRA_SEPARATION_SCALE * separationCompensation
    );
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
    let dipOffset = 0;

    if (influence > 0) {
      if (type === 'connect') {
        dipOffset = this.dipDepth * influence;
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
    if (dipOffset !== 0) {
      _dipDir.set(-tangent.y, tangent.x, 0);

      if (this.bulbTarget) {
        _targetDelta.copy(this.bulbTarget).sub(basePoint);
        if (_dipDir.dot(_targetDelta) < 0) {
          _dipDir.multiplyScalar(-1);
        }
      } else {
        _dipDir.set(0, -1, 0);
      }

      if (_dipDir.lengthSq() < 0.000001) {
        _dipDir.set(0, -1, 0);
      } else {
        _dipDir.normalize();
      }
      _finalPos.addScaledVector(_dipDir, dipOffset);
    }

    // Tuck the dip behind the base line so the ribbon does not read in
    // front of the socket; `connectZBack` scales with WIRE_THICKNESS.
    if (this.isBillboard && type === 'connect' && influence > 0) {
      _finalPos.z = basePoint.z - this.connectZBack * influence;
    }

    // Per-twist Z: helix-rate depth so strands do not sit in one plane.
    // The normal/binormal offset above already gives the pair a true helix
    // around the base curve. Do not add a second unrelated Z sine here: that
    // was making the cord read as overlapping waves instead of one physical
    // strand wrapping over and under the other.

    return optionalTarget.copy(_finalPos);
  }
}
