export interface BillboardInstanceOffset {
  y: number;
  z: number;
}

export const BILLBOARD_OFFSETS = {
  filament: { y: -2.2, z: 0.04 } satisfies BillboardInstanceOffset,
  glass: { y: -1.4, z: 0.05 } satisfies BillboardInstanceOffset,
  socket: { y: -1.75, z: 0.1 } satisfies BillboardInstanceOffset,
} as const;

export const SOCKET_SHAPE_TOP_Y = 1.15;
export const SEPARATION_COMPENSATION_SCALE = 0.9;

const SOCKET_WIRE_JOIN_OVERLAP_Y = 0.03;
const MIN_SOCKET_JOIN_Z_BACK = 0.08;

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

export function socketJoinZBackLimit(bulbScale: number): number {
  return Math.max(MIN_SOCKET_JOIN_Z_BACK, socketWireJoinDepth(bulbScale, 0));
}
