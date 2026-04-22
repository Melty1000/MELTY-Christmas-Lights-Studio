import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import type { TwistedCurve } from './TwistedCurve.ts';

const RADIAL = 8;

const _radialSin: number[] = [];
const _radialCos: number[] = [];
for (let j = 0; j <= RADIAL; j++) {
  const v = (j / RADIAL) * Math.PI * 2;
  _radialSin.push(Math.sin(v));
  _radialCos.push(Math.cos(v));
}

export interface TubeBuffers {
  geometry: BufferGeometry;
  positions: Float32Array;
  normals: Float32Array;
  segments: number;
}

export function allocateTubeBuffers(segments: number): TubeBuffers {
  const vertexCount = (segments + 1) * (RADIAL + 1);
  const indexCount = segments * RADIAL * 6;
  const indices = new Uint32Array(indexCount);
  let idx = 0;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = i * (RADIAL + 1) + j;
      const b = (i + 1) * (RADIAL + 1) + j;
      const c = (i + 1) * (RADIAL + 1) + (j + 1);
      const d = i * (RADIAL + 1) + (j + 1);
      indices[idx++] = a;
      indices[idx++] = b;
      indices[idx++] = d;
      indices[idx++] = b;
      indices[idx++] = c;
      indices[idx++] = d;
    }
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return { geometry, positions, normals, segments };
}

const _P = new Vector3();
const _T = new Vector3();
const _N = new Vector3();
const _B = new Vector3();

export function writeTubePositions(
  buffers: TubeBuffers,
  curve: TwistedCurve,
  thickness: number,
): void {
  const { positions, normals, segments, geometry } = buffers;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPoint(t, _P);
    curve.baseCurve.getTangent(t, _T).normalize();
    if (Math.abs(_T.y) > 0.99) _N.set(1, 0, 0);
    else _N.set(0, 1, 0);
    _B.crossVectors(_T, _N).normalize();
    _N.crossVectors(_B, _T).normalize();
    for (let j = 0; j <= RADIAL; j++) {
      const sin = _radialSin[j]!;
      const cos = _radialCos[j]!;
      const vertIdx = (i * (RADIAL + 1) + j) * 3;
      positions[vertIdx] = _P.x + thickness * (cos * _N.x + sin * _B.x);
      positions[vertIdx + 1] = _P.y + thickness * (cos * _N.y + sin * _B.y);
      positions[vertIdx + 2] = _P.z + thickness * (cos * _N.z + sin * _B.z);
      normals[vertIdx] = cos * _N.x + sin * _B.x;
      normals[vertIdx + 1] = cos * _N.y + sin * _B.y;
      normals[vertIdx + 2] = cos * _N.z + sin * _B.z;
    }
  }
  geometry.attributes.position!.needsUpdate = true;
  geometry.attributes.normal!.needsUpdate = true;
  geometry.computeBoundingSphere();
}

export function segmentCountForQuality(quality: string, wireTwists: number): number {
  const qualityMap: Record<string, number> = {
    billboard: 150,
    medium: 750,
    high: 1400,
    ultra: 2000,
  };
  const segments = qualityMap[quality] ?? 1400;
  const twistMultiplier = Math.max(1, wireTwists / 40);
  return Math.min(4000, Math.floor(segments * twistMultiplier));
}
