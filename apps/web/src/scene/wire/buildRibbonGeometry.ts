import { BufferAttribute, BufferGeometry, type Curve, Vector3 } from 'three';

// ---------------------------------------------------------------------------
// Ribbon geometry for billboarded wires
// ---------------------------------------------------------------------------
//
// Each curve sample produces two collinear vertices at the curve's CENTER
// point. The actual left/right extrusion happens in the vertex shader
// (`createWireMaterial.ts`) by pushing each vertex along a camera-aligned
// perpendicular. Because the perpendicular is recomputed per-frame from
// `cameraPosition`, the ribbon's flat face always points at the camera
// and we never see the "thin edge of paper" look.
//
// Attributes written here:
//   • position (vec3) — curve center, duplicated for both sides.
//   • normal   (vec3) — constant +Z (never sampled by the wire shader,
//                       kept only so debug/std lighting passes don't crash).
//   • uv       (vec2) — U along length, V = 0 on one side and 1 on the
//                       other so the fragment shader can fake a rounded
//                       cross-section.
//   • aTangent (vec3) — normalized curve tangent at the sample, same for
//                       both duplicated verts. Used by the vertex shader
//                       to compute the view-aligned bitangent.
//   • aSide    (float)— -1 for one side, +1 for the other. Multiplies the
//                       thickness uniform in the vertex shader.
//
// Positions are written once at mount (or whenever the curve changes)
// because the center points don't depend on the camera — only the
// extrusion does. Keeping them static also means we get a cheap bounding
// sphere that doesn't wobble with the camera.

export interface RibbonBuffers {
  geometry: BufferGeometry;
  positions: Float32Array;
  tangents: Float32Array;
  segments: number;
}

export interface BatchedRibbonBuffers extends RibbonBuffers {
  curveCount: number;
}

export function allocateRibbonBuffers(segments: number): RibbonBuffers {
  return allocateBatchedRibbonBuffers(1, segments);
}

export function allocateBatchedRibbonBuffers(
  curveCount: number,
  segments: number,
): BatchedRibbonBuffers {
  const safeCurveCount = Math.max(1, curveCount);
  const verticesPerCurve = (segments + 1) * 2;
  const vertexCount = safeCurveCount * verticesPerCurve;
  const indexCount = safeCurveCount * segments * 6;
  const indices = new Uint32Array(indexCount);
  let idx = 0;
  for (let curveIndex = 0; curveIndex < safeCurveCount; curveIndex++) {
    const vertexBase = curveIndex * verticesPerCurve;
    for (let i = 0; i < segments; i++) {
      const a = vertexBase + i * 2;
      const b = vertexBase + (i + 1) * 2;
      const c = vertexBase + (i + 1) * 2 + 1;
      const d = vertexBase + i * 2 + 1;
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
  const tangents = new Float32Array(vertexCount * 3);
  const sides = new Float32Array(vertexCount);

  for (let curveIndex = 0; curveIndex < safeCurveCount; curveIndex++) {
    const vertexBase = curveIndex * verticesPerCurve;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const leftVertex = vertexBase + i * 2;
      const rightVertex = leftVertex + 1;

      // Left vertex: side = -1, V = 0
      uvs[leftVertex * 2] = t;
      uvs[leftVertex * 2 + 1] = 0;
      sides[leftVertex] = -1;
      // Right vertex: side = +1, V = 1
      uvs[rightVertex * 2] = t;
      uvs[rightVertex * 2 + 1] = 1;
      sides[rightVertex] = 1;

      normals[leftVertex * 3] = 0;
      normals[leftVertex * 3 + 1] = 0;
      normals[leftVertex * 3 + 2] = 1;
      normals[rightVertex * 3] = 0;
      normals[rightVertex * 3 + 1] = 0;
      normals[rightVertex * 3 + 2] = 1;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('aTangent', new BufferAttribute(tangents, 3));
  geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return { geometry, positions, tangents, segments, curveCount: safeCurveCount };
}

const _P = new Vector3();
const _T = new Vector3();

// Writes curve center positions and per-vertex tangents on mount, when the
// curve reference changes, or when connect Z tuck updates (thickness). The
// shader handles width extrusion from `cameraPosition`.
export function writeRibbonPositions(
  buffers: RibbonBuffers,
  curve: Curve<Vector3>,
): void {
  writeBatchedRibbonPositions(
    { ...buffers, curveCount: 1 },
    [curve],
  );
}

export function writeBatchedRibbonPositions(
  buffers: BatchedRibbonBuffers,
  curves: Curve<Vector3>[],
): void {
  const { positions, tangents, segments, geometry, curveCount } = buffers;
  const verticesPerCurve = (segments + 1) * 2;
  const usedCurveCount = Math.min(curveCount, curves.length);

  for (let curveIndex = 0; curveIndex < usedCurveCount; curveIndex++) {
    const curve = curves[curveIndex]!;
    const vertexBase = curveIndex * verticesPerCurve;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      curve.getPoint(t, _P);
      // Use the TWISTED curve's tangent, not the base curve's. The base
      // Catmull-Rom tangent points along the overall wire path, but the
      // actual visible cord follows the twisted offset — sampling that
      // tangent numerically gives us the direction the ribbon should be
      // extruded perpendicular to, so the billboarding face stays flush
      // with the visible cord at every twist. The old `baseCurve.getTangent`
      // was producing a subtle lean that showed up as jagged silhouette
      // wobble when the camera orbited.
      curve.getTangent(t, _T);
      _T.normalize();

      const leftIdx = (vertexBase + i * 2) * 3;
      const rightIdx = (vertexBase + i * 2 + 1) * 3;

      // Both duplicated verts sit exactly on the curve center — the shader
      // moves them outward by +/- thickness along a view-aligned normal.
      positions[leftIdx] = _P.x;
      positions[leftIdx + 1] = _P.y;
      positions[leftIdx + 2] = _P.z;

      positions[rightIdx] = _P.x;
      positions[rightIdx + 1] = _P.y;
      positions[rightIdx + 2] = _P.z;

      tangents[leftIdx] = _T.x;
      tangents[leftIdx + 1] = _T.y;
      tangents[leftIdx + 2] = _T.z;

      tangents[rightIdx] = _T.x;
      tangents[rightIdx + 1] = _T.y;
      tangents[rightIdx + 2] = _T.z;
    }
  }

  geometry.attributes.position!.needsUpdate = true;
  geometry.attributes.aTangent!.needsUpdate = true;
  geometry.computeBoundingSphere();
}
