import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import type { TwistedCurve } from './TwistedCurve.ts';

export interface RibbonBuffers {
  geometry: BufferGeometry;
  positions: Float32Array;
  normals: Float32Array;
  segments: number;
}

export function allocateRibbonBuffers(segments: number): RibbonBuffers {
  const vertexCount = (segments + 1) * 2;
  const indexCount = segments * 6;
  const indices = new Uint32Array(indexCount);
  let idx = 0;
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    const c = (i + 1) * 2 + 1;
    const d = i * 2 + 1;
    indices[idx++] = a;
    indices[idx++] = b;
    indices[idx++] = d;
    indices[idx++] = b;
    indices[idx++] = c;
    indices[idx++] = d;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    uvs[i * 4] = t;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = t;
    uvs[i * 4 + 3] = 1;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return { geometry, positions, normals, segments };
}

const _P = new Vector3();
const _T = new Vector3();

// Legacy billboard ribbon: 2 vertices per sample, expanded perpendicular to the
// curve's tangent in the world XY plane only (Z is preserved). This keeps the
// wire visually flat toward the camera and hides the 3D helix twist that would
// otherwise appear to rotate around the wire's axis as the camera zooms.
export function writeRibbonPositions(
  buffers: RibbonBuffers,
  curve: TwistedCurve,
  thickness: number,
): void {
  const { positions, normals, segments, geometry } = buffers;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPoint(t, _P);
    curve.baseCurve.getTangent(t, _T);

    // Bitangent in the XY plane perpendicular to the horizontal tangent.
    let bx = -_T.y;
    let by = _T.x;
    const blen = Math.hypot(bx, by);
    if (blen > 1e-6) {
      bx /= blen;
      by /= blen;
    } else {
      bx = 0;
      by = 1;
    }

    const leftIdx = i * 2 * 3;
    const rightIdx = (i * 2 + 1) * 3;

    positions[leftIdx] = _P.x - thickness * bx;
    positions[leftIdx + 1] = _P.y - thickness * by;
    positions[leftIdx + 2] = _P.z;

    positions[rightIdx] = _P.x + thickness * bx;
    positions[rightIdx + 1] = _P.y + thickness * by;
    positions[rightIdx + 2] = _P.z;

    normals[leftIdx] = 0;
    normals[leftIdx + 1] = 0;
    normals[leftIdx + 2] = 1;
    normals[rightIdx] = 0;
    normals[rightIdx + 1] = 0;
    normals[rightIdx + 2] = 1;
  }
  geometry.attributes.position!.needsUpdate = true;
  geometry.attributes.normal!.needsUpdate = true;
  geometry.computeBoundingSphere();
}
