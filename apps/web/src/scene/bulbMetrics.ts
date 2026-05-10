import { Vector3 } from 'three';

export interface BillboardInstanceOffset {
  y: number;
  z: number;
}

export const ORTHO_CAMERA_FORWARD = new Vector3(0, 4.8, -15).normalize();
export const ORTHO_CAMERA_DEPTH_DIRECTION = ORTHO_CAMERA_FORWARD.clone().multiplyScalar(-1);

export const BILLBOARD_OFFSETS = {
  filament: { y: -2.2, z: 0.04 } satisfies BillboardInstanceOffset,
  glass: { y: -1.4, z: 0.05 } satisfies BillboardInstanceOffset,
  socket: { y: -1.75, z: 0.1 } satisfies BillboardInstanceOffset,
} as const;

export const SOCKET_SHAPE_TOP_Y = 1.15;
export const SEPARATION_COMPENSATION_SCALE = 0.9;
export const GLASS_SOCKET_OCCLUSION_Y = -0.3;

const SOCKET_WIRE_JOIN_OVERLAP_Y = 0.14;

export function socketWireJoinDepth(
  bulbScale: number,
  separationCompensation: number,
): number {
  const socketLipDepth = (
    Math.abs(BILLBOARD_OFFSETS.socket.y)
    - SOCKET_SHAPE_TOP_Y
    + SOCKET_WIRE_JOIN_OVERLAP_Y
  ) * bulbScale;

  return socketLipDepth + separationCompensation * SEPARATION_COMPENSATION_SCALE;
}

export function billboardDepthBoost(wireThickness: number, cameraDistance: number): number {
  const inv = 0.03 / (wireThickness + 0.0055);
  const distScale = 1.0 + 0.07 * Math.max(0, cameraDistance - 8);

  return Math.min(
    0.4,
    (0.02 + 0.2 * Math.min(2.2, inv) + 0.08 * Math.min(1, inv * inv * 0.04)) * distScale,
  );
}
