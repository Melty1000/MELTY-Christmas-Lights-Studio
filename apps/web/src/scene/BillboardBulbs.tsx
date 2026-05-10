import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  type Camera,
  type Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { createBulbAnimationState, stepBulbAnimation, type BulbAnimationState } from './animation.ts';
import {
  beginPointSpillFrame,
  POINT_SPILL_MAX,
  pointSpillCol,
  pointSpillCount,
  pointSpillPos,
  pushPointSpill,
} from './wire/pointSpillState.ts';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { getBulbPalette } from './utils.ts';
import {
  BILLBOARD_OFFSETS,
  billboardDepthBoost,
  GLASS_SOCKET_OCCLUSION_Y,
  SEPARATION_COMPENSATION_SCALE,
  SOCKET_SHAPE_TOP_Y,
  type BillboardInstanceOffset,
} from './bulbMetrics.ts';
import { beginBulbHaloFrame, pushBulbHalo } from './effects/bulbHaloState.ts';
import { BULB_PROFILE, createBulbGlassShape } from './bulbProfile.ts';
import { resolveWireGeometry } from '@melty/shared';
import { computeBillboardHaloIntensity } from './billboardHaloMath.ts';

export interface BillboardBulbDatum {
  baseColorHex: number;
  position: [number, number, number];
  direction: [number, number, number];
  socketColorHex: number;
}

interface BillboardBulbsProps {
  bulbs: BillboardBulbDatum[];
  themePalette: number[];
  // Bulb scale is structural because wire dips/socket leads are built around
  // it, so BillboardBulbs receives the same scale snapshot from Scene. Other
  // config values (glass opacity,
  // GLASS_OPACITY, BULB_INTERNAL_GLOW, AMBIENT_INTENSITY, animation params)
  // are read imperatively each frame via useConfigStore.getState() so that
  // dragging those sliders doesn't cause any React reconciliation here.
  bulbScale: number;
  separationCompensation: number;
  resetPointSpill?: boolean;
  exactSocketColorMode?: boolean;
  socketMetalness?: number;
}

interface BillboardGeometries {
  glass: ShapeGeometry;
  filament: ShapeGeometry;
  socket: ShapeGeometry;
  halo: PlaneGeometry;
}

const _glassDummy = new Object3D();
const _filamentDummy = new Object3D();
const _socketDummy = new Object3D();
const _haloDummy = new Object3D();
const _haloProjectionDummy = new Object3D();
const _lookAtTarget = new Vector3();
const _assemblyDepthWorld = new Vector3();
const _instanceDepthWorld = new Vector3();
const _pointSpillWorld = new Vector3();
const _haloCenterWorld = new Vector3();
const _haloEdgeWorld = new Vector3();
const _haloTipWorld = new Vector3();
const _haloNeckWorld = new Vector3();
const _haloCenterScreen = new Vector3();
const _haloEdgeScreen = new Vector3();
const _haloTipScreen = new Vector3();
const _haloNeckScreen = new Vector3();
const _animatedColor = new Color();
const _haloColor = new Color();
const _socketColor = new Color();
const _filamentColor = new Color();

const SOCKET_POINT_SPILL_ACCUMULATION = Array.from(
  { length: POINT_SPILL_MAX },
  (_, index) => (
    `pAcc += step(${(index + 0.5).toFixed(1)}, uPCount) * socketPointTerm(vWorldPos, uPPos[${index}], uPCol[${index}], spillFacing);`
  ),
).join('\n          ');

// ---------------------------------------------------------------------------
// "Reflections" (virtual per-bulb spill)
// ---------------------------------------------------------------------------
// Colored per-bulb spill onto the wire and sockets is always available through
// the hand-written shader spill in `createWireMaterial`.
// Billboards are custom shaders too.
// Tuning notes below reflect the constraints of this scene specifically — not
// generic point light physics.

// Virtual emitter cap. 80 is a safe cap that still gives dense strands
// noticeable spill without making the wire/socket shaders evaluate every bulb.
const MAX_POINT_LIGHTS = 80;

// Multiplied by per-bulb animation.intensity (0..1) so dim bulbs cast less
// spill. Anything much higher turns the wire into a solid glowing sausage.
const POINT_LIGHT_INTENSITY = 32;

// Vertical offset from the bulb's attachment point (socket/wire junction) up
// into the glass body. Placing the virtual emitter here, rather than at the
// exact wire position, pushes the brightest spill DOWN onto the wire so the
// effect is visible from the usual viewing angle instead of being hidden
// inside the wire geometry. ~0.3 in legacy local space; here we scale with
// BULB_SCALE.
const POINT_LIGHT_VERTICAL_OFFSET = 0.3;

const HALO_CENTER_OFFSET_Y = -2.7;
const HALO_DEPTH_OFFSET = -0.16;
const HALO_BASE_SCALE = 4.5;
const HALO_RADIUS_SCALE = 12.0;
const BULB_LIGHT_DEADZONE = 0.0005;
const BULB_LIGHT_FADE_KNEE = 0.08;
const MAX_BULB_HALOS = 96;

export function BillboardBulbs({
  bulbs,
  themePalette,
  bulbScale,
  separationCompensation,
  resetPointSpill = true,
  exactSocketColorMode = false,
  socketMetalness = 0,
}: BillboardBulbsProps) {
  const groupRef = useRef<Group>(null);
  const glassRef = useRef<InstancedMesh>(null);
  const filamentRef = useRef<InstancedMesh>(null);
  const socketRef = useRef<InstancedMesh>(null);
  const haloRef = useRef<InstancedMesh>(null);
  const animationStatesRef = useRef<BulbAnimationState[]>([]);
  const geometries = useMemo(createBillboardGeometries, []);
  const glassMaterial = useMemo(createGlassMaterial, []);
  const filamentMaterial = useMemo(createFilamentMaterial, []);
  const socketMaterial = useMemo(createSocketMaterial, []);
  const haloMaterial = useMemo(createHaloMaterial, []);

  const virtualSpillCount = Math.min(bulbs.length, MAX_POINT_LIGHTS);
  const spillBulbIndexes = useMemo(
    () => buildSpillBulbIndexes(bulbs.length, virtualSpillCount),
    [bulbs.length, virtualSpillCount],
  );
  const haloBulbIndexes = useMemo(
    () => buildSpillBulbIndexes(bulbs.length, Math.min(bulbs.length, MAX_BULB_HALOS)),
    [bulbs.length],
  );
  const spillSlotByBulbIndex = useMemo(() => {
    const slots = new Array<number>(bulbs.length).fill(-1);
    spillBulbIndexes.forEach((bulbIndex, slot) => {
      slots[bulbIndex] = slot;
    });
    return slots;
  }, [bulbs.length, spillBulbIndexes]);
  const haloSlotByBulbIndex = useMemo(() => {
    const slots = new Array<number>(bulbs.length).fill(-1);
    haloBulbIndexes.forEach((bulbIndex, slot) => {
      slots[bulbIndex] = slot;
    });
    return slots;
  }, [bulbs.length, haloBulbIndexes]);

  useEffect(() => {
    animationStatesRef.current = bulbs.map((_, index) => animationStatesRef.current[index] ?? createBulbAnimationState(index));
  }, [bulbs]);

  // Must be useLayoutEffect, not useEffect. R3F's render loop runs via rAF
  // and on first mount it can fire BEFORE a passive useEffect has attached
  // the instance attributes — which would throw `Cannot read properties of
  // undefined (reading 'setXYZ')` every frame and eventually cost us the
  // WebGL context. useLayoutEffect runs synchronously after render/commit
  // but before the browser gets a chance to paint, which is also before R3F
  // schedules its first frame, so the attributes are guaranteed to exist by
  // the time useFrame reads them.
  useLayoutEffect(() => {
    const glass = glassRef.current;
    const filament = filamentRef.current;
    const socket = socketRef.current;
    const halo = haloRef.current;
    if (!glass || !filament || !socket || !halo) return;

    glass.instanceMatrix.setUsage(DynamicDrawUsage);
    filament.instanceMatrix.setUsage(DynamicDrawUsage);
    socket.instanceMatrix.setUsage(DynamicDrawUsage);
    halo.instanceMatrix.setUsage(DynamicDrawUsage);

    glass.geometry.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(bulbs.length * 3), 3));
    glass.geometry.setAttribute('instanceEmissive', new InstancedBufferAttribute(new Float32Array(bulbs.length), 1));
    filament.geometry.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(bulbs.length * 3), 3));
    filament.geometry.setAttribute('instanceEmissive', new InstancedBufferAttribute(new Float32Array(bulbs.length), 1));
    socket.geometry.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(bulbs.length * 3), 3));
    halo.geometry.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(bulbs.length * 3), 3));
    halo.geometry.setAttribute('instanceIntensity', new InstancedBufferAttribute(new Float32Array(bulbs.length), 1));
  }, [bulbs.length]);

  useFrame(({ camera, clock }, delta) => {
    const group = groupRef.current;
    const glass = glassRef.current;
    const filament = filamentRef.current;
    const socket = socketRef.current;
    const halo = haloRef.current;
    if (!group || !glass || !filament || !socket || !halo) return;
    group.updateWorldMatrix(true, false);

    // Pull the live config every frame. Zero React overhead — this is just
    // a ref read, so every continuous slider (bulb scale, emissive, glass
    // opacity, ambient, animation speeds/styles) updates on the next GL
    // frame without re-rendering the scene graph.
    const config = useConfigStore.getState().config;
    if (resetPointSpill) {
      beginPointSpillFrame();
      beginBulbHaloFrame();
    }

    const glassColorAttr = glass.geometry.getAttribute('instanceColor') as
      | InstancedBufferAttribute
      | undefined;
    const glassEmissiveAttr = glass.geometry.getAttribute('instanceEmissive') as
      | InstancedBufferAttribute
      | undefined;
    const filamentColorAttr = filament.geometry.getAttribute('instanceColor') as
      | InstancedBufferAttribute
      | undefined;
    const filamentEmissiveAttr = filament.geometry.getAttribute('instanceEmissive') as
      | InstancedBufferAttribute
      | undefined;
    const socketColorAttr = socket.geometry.getAttribute('instanceColor') as
      | InstancedBufferAttribute
      | undefined;
    const haloColorAttr = halo.geometry.getAttribute('instanceColor') as
      | InstancedBufferAttribute
      | undefined;
    const haloIntensityAttr = halo.geometry.getAttribute('instanceIntensity') as
      | InstancedBufferAttribute
      | undefined;

    // Belt-and-braces guard: if R3F ever reconstructs the InstancedMesh (e.g.
    // when `args` change due to bulbs.length swapping) the attribute setup
    // effect might race the first post-remount frame. Bailing out for one
    // frame is cheaper than losing the WebGL context to a thrown TypeError.
    if (
      !glassColorAttr ||
      !glassEmissiveAttr ||
      !filamentColorAttr ||
      !filamentEmissiveAttr ||
      !socketColorAttr ||
      !haloColorAttr ||
      !haloIntensityAttr
    ) {
      return;
    }

    const tWire = resolveWireGeometry(config).WIRE_THICKNESS;
    // Same camera-space +Z (billboard "depth") for glass, filament, socket, lights.
    // Thinner ribbon and zoomed-out camera: push the cap stack toward the lens
    // so dips stay behind the gold shell (log-Z precision + parallax both hurt).
    const zBoost = billboardDepthBoost(tWire, config.CAMERA_DISTANCE);

    const elapsed = clock.getElapsedTime();
      const haloScale = bulbScale * (HALO_BASE_SCALE + config.HALO_RADIUS * HALO_RADIUS_SCALE);
      const outwardOffset = separationCompensation * SEPARATION_COMPENSATION_SCALE;
      for (let index = 0; index < bulbs.length; index++) {
      const bulb = bulbs[index]!;
      const state = animationStatesRef.current[index] ?? createBulbAnimationState(index);
      animationStatesRef.current[index] = state;

      const animation = stepBulbAnimation(
        state,
        config,
        elapsed,
        delta,
        index,
        bulbs.length,
        bulb.baseColorHex,
        themePalette,
      );
      const visibleLightIntensity = computeVisibleBulbLightIntensity(animation.intensity);

      const palette = getBulbPalette(animation.colorHex);
      const [x, y, z] = bulb.position;
      const [dirX, dirY] = bulb.direction;

      getCameraDepthOffset(camera, zBoost, _assemblyDepthWorld);

      writeInstance(
        glass,
        index,
        _glassDummy,
        camera,
        x,
        y,
        z,
        bulbScale,
        { y: BILLBOARD_OFFSETS.glass.y, z: BILLBOARD_OFFSETS.glass.z + zBoost },
        dirX,
        dirY,
        outwardOffset,
      );
      writeInstance(
        filament,
        index,
        _filamentDummy,
        camera,
        x,
        y,
        z,
        bulbScale,
        { y: BILLBOARD_OFFSETS.filament.y, z: BILLBOARD_OFFSETS.filament.z + zBoost },
        dirX,
        dirY,
        outwardOffset,
      );
      writeInstance(
        socket,
        index,
        _socketDummy,
        camera,
        x,
        y,
        z,
        bulbScale,
        { y: BILLBOARD_OFFSETS.socket.y, z: BILLBOARD_OFFSETS.socket.z + zBoost },
        dirX,
        dirY,
        outwardOffset,
      );
      writeHaloInstance(
        halo,
        index,
        _haloDummy,
        camera,
        x,
        y,
        z,
        haloScale,
        { y: HALO_CENTER_OFFSET_Y, z: HALO_DEPTH_OFFSET + zBoost },
        bulbScale,
        dirX,
        dirY,
        outwardOffset,
      );

      _animatedColor.setHex(animation.colorHex);
      _animatedColor.copy(palette.core);
      _haloColor.copy(palette.core);
      _filamentColor.copy(palette.filament);
      _socketColor.setHex(bulb.socketColorHex);

      glassColorAttr.setXYZ(index, _animatedColor.r, _animatedColor.g, _animatedColor.b);
      glassEmissiveAttr.setX(index, animation.intensity);

      filamentColorAttr.setXYZ(index, _filamentColor.r, _filamentColor.g, _filamentColor.b);
      filamentEmissiveAttr.setX(index, animation.intensity);

      socketColorAttr.setXYZ(index, _socketColor.r, _socketColor.g, _socketColor.b);
      haloColorAttr.setXYZ(index, _haloColor.r, _haloColor.g, _haloColor.b);
      haloIntensityAttr.setX(
        index,
        computeBillboardHaloIntensity(config.HALO_STRENGTH, config.HALO_INTENSITY, visibleLightIntensity),
      );

      const haloSlot = haloSlotByBulbIndex[index] ?? -1;
      if (haloSlot >= 0) {
        pushScreenSpaceBulbHalo({
          camera,
          group,
          x,
          y,
          z,
          scale: bulbScale,
          zBoost,
          directionX: dirX,
          directionY: dirY,
          outwardOffset,
          colorHex: animation.colorHex,
          visibleLightIntensity,
          sourceIntensity: config.HALO_SOURCE_INTENSITY,
        });
      }

      // Drive the optional virtual spill budget for colored reflections onto
      // wire/socket shaders. When the strand has more bulbs than the spill cap,
      // sampled emitters are distributed across the whole strand instead of
      // clumping at the first/left side.
      const spillSlot = spillSlotByBulbIndex[index] ?? -1;
      if (spillSlot >= 0) {
        const pointIntensity = POINT_LIGHT_INTENSITY
          * visibleLightIntensity
          * Math.max(0, config.REFLECTION_INTENSITY);
        const lightOutwardOffset = POINT_LIGHT_VERTICAL_OFFSET * bulbScale + outwardOffset;
        _pointSpillWorld
          .set(
            x + dirX * lightOutwardOffset + _assemblyDepthWorld.x,
            y + dirY * lightOutwardOffset + _assemblyDepthWorld.y,
            z + _assemblyDepthWorld.z,
          )
          .applyMatrix4(group.matrixWorld);
        pushPointSpill(
          _pointSpillWorld.x,
          _pointSpillWorld.y,
          _pointSpillWorld.z,
          animation.colorHex,
          pointIntensity,
        );
      }
    }

    glass.instanceMatrix.needsUpdate = true;
    filament.instanceMatrix.needsUpdate = true;
    socket.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    glassColorAttr.needsUpdate = true;
    glassEmissiveAttr.needsUpdate = true;
    filamentColorAttr.needsUpdate = true;
    filamentEmissiveAttr.needsUpdate = true;
    socketColorAttr.needsUpdate = true;
    haloColorAttr.needsUpdate = true;
    haloIntensityAttr.needsUpdate = true;

    (glassMaterial.uniforms.baseOpacity!).value = config.GLASS_OPACITY;
    (glassMaterial.uniforms.baseEmissiveIntensity!).value = config.BULB_INTERNAL_GLOW;
    (glassMaterial.uniforms.uAmbient!).value = config.AMBIENT_INTENSITY;
    (glassMaterial.uniforms.uGlassRoughness!).value = config.GLASS_ROUGHNESS;
    (filamentMaterial.uniforms.baseEmissiveIntensity!).value = config.BULB_INTERNAL_GLOW;
    (socketMaterial.uniforms.uAmbient!).value = config.AMBIENT_INTENSITY;
    (socketMaterial.uniforms.uExactColorMode!).value = exactSocketColorMode ? 1 : 0;
    (socketMaterial.uniforms.uMetalness!).value = socketMetalness;
    const socketPointCount = Math.min(POINT_SPILL_MAX, pointSpillCount);
    (socketMaterial.uniforms.uPCount as { value: number }).value = socketPointCount;
    const socketPointPositions = socketMaterial.uniforms.uPPos as { value: Vector3[] } | undefined;
    const socketPointColors = socketMaterial.uniforms.uPCol as { value: Color[] } | undefined;
    for (let i = 0; i < POINT_SPILL_MAX; i++) {
      const pointPosition = socketPointPositions?.value[i];
      const pointColor = socketPointColors?.value[i];
      if (pointPosition && pointColor) {
        pointPosition.copy(pointSpillPos[i]!);
        pointColor.copy(pointSpillCol[i]!);
      }
    }
  });

  useEffect(() => {
    return () => {
      geometries.glass.dispose();
      geometries.filament.dispose();
      geometries.socket.dispose();
      geometries.halo.dispose();
      glassMaterial.dispose();
      filamentMaterial.dispose();
      socketMaterial.dispose();
      haloMaterial.dispose();
    };
  }, [filamentMaterial, geometries, glassMaterial, haloMaterial, socketMaterial]);

  return (
    <group ref={groupRef}>
      <instancedMesh ref={socketRef} args={[geometries.socket, socketMaterial, bulbs.length]} renderOrder={0} />
      <instancedMesh ref={haloRef} args={[geometries.halo, haloMaterial, bulbs.length]} renderOrder={4} />
      <instancedMesh ref={glassRef} args={[geometries.glass, glassMaterial, bulbs.length]} renderOrder={10} />
      <instancedMesh ref={filamentRef} args={[geometries.filament, filamentMaterial, bulbs.length]} renderOrder={11} />
    </group>
  );
}

function buildSpillBulbIndexes(totalBulbs: number, spillCount: number): number[] {
  if (totalBulbs <= 0 || spillCount <= 0) return [];
  if (spillCount >= totalBulbs) {
    return Array.from({ length: totalBulbs }, (_, index) => index);
  }
  if (spillCount === 1) {
    return [Math.floor((totalBulbs - 1) / 2)];
  }

  const indexes: number[] = [];
  const used = new Set<number>();
  const step = (totalBulbs - 1) / (spillCount - 1);
  for (let slot = 0; slot < spillCount; slot++) {
    let index = Math.round(slot * step);
    while (used.has(index) && index < totalBulbs - 1) index++;
    while (used.has(index) && index > 0) index--;
    if (!used.has(index)) {
      used.add(index);
      indexes.push(index);
    }
  }
  return indexes;
}

function writeInstance(
  mesh: InstancedMesh,
  index: number,
  dummy: Object3D,
  camera: Camera,
  x: number,
  y: number,
  z: number,
  scale: number,
  offset: BillboardInstanceOffset,
  directionX: number,
  directionY: number,
  outwardOffset = 0,
) {
  // Horizontal-only rotation: look at the camera projected to the bulb's Y
  // (same y as the attachment point) so the cap stack stays on the string in XZ.
  _lookAtTarget.set(camera.position.x, y, camera.position.z);
  dummy.position.set(x, y, z);
  dummy.scale.setScalar(scale);
  dummy.lookAt(_lookAtTarget);
  dummy.rotateZ(Math.atan2(directionX, -directionY));
  // Keep the attachment offset in bulb-direction space, not billboard-camera
  // space. Otherwise edge-of-screen billboards rotate the local Y offset into
  // X and the socket drifts away from the lead endpoint.
  const alongBulb = -offset.y * scale + outwardOffset;
  const depthOffset = getCameraDepthOffset(camera, offset.z, _instanceDepthWorld);
  dummy.position.set(
    x + directionX * alongBulb + depthOffset.x,
    y + directionY * alongBulb + depthOffset.y,
    z + depthOffset.z,
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function writeHaloInstance(
  mesh: InstancedMesh,
  index: number,
  dummy: Object3D,
  camera: Camera,
  x: number,
  y: number,
  z: number,
  scale: number,
  offset: BillboardInstanceOffset,
  bulbScale: number,
  directionX: number,
  directionY: number,
  outwardOffset = 0,
) {
  _lookAtTarget.set(camera.position.x, y, camera.position.z);
  dummy.position.set(x, y, z);
  dummy.scale.setScalar(scale);
  dummy.lookAt(_lookAtTarget);
  dummy.rotateZ(Math.atan2(directionX, -directionY));
  const alongBulb = -offset.y * bulbScale + outwardOffset;
  const depthOffset = getCameraDepthOffset(camera, offset.z, _instanceDepthWorld);
  dummy.position.set(
    x + directionX * alongBulb + depthOffset.x,
    y + directionY * alongBulb + depthOffset.y,
    z + depthOffset.z,
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function computeVisibleBulbLightIntensity(intensity: number): number {
  const clamped = Math.min(1, Math.max(0, intensity));
  if (clamped <= BULB_LIGHT_DEADZONE) return 0;
  if (clamped >= BULB_LIGHT_FADE_KNEE) return clamped;

  const t = clamped / BULB_LIGHT_FADE_KNEE;
  const eased = t * t * (3 - 2 * t);
  return clamped * eased;
}

function getCameraDepthOffset(camera: Camera, depth: number, target: Vector3): Vector3 {
  return camera.getWorldDirection(target).multiplyScalar(-depth);
}

function pushScreenSpaceBulbHalo({
  camera,
  group,
  x,
  y,
  z,
  scale,
  zBoost,
  directionX,
  directionY,
  outwardOffset,
  colorHex,
  visibleLightIntensity,
  sourceIntensity,
}: {
  camera: Camera;
  group: Group;
  x: number;
  y: number;
  z: number;
  scale: number;
  zBoost: number;
  directionX: number;
  directionY: number;
  outwardOffset: number;
  colorHex: number;
  visibleLightIntensity: number;
  sourceIntensity: number;
}): void {
  const source = Math.max(0, Math.min(20, sourceIntensity)) / 20;
  const intensity = visibleLightIntensity * source;
  if (intensity <= 0) return;

  _lookAtTarget.set(camera.position.x, y, camera.position.z);
  _haloProjectionDummy.position.set(x, y, z);
  _haloProjectionDummy.scale.setScalar(scale);
  _haloProjectionDummy.lookAt(_lookAtTarget);
  _haloProjectionDummy.rotateZ(Math.atan2(directionX, -directionY));
  const glassOriginAlong = -BILLBOARD_OFFSETS.glass.y * scale + outwardOffset;
  const depthOffset = getCameraDepthOffset(
    camera,
    BILLBOARD_OFFSETS.glass.z + zBoost,
    _instanceDepthWorld,
  );
  _haloProjectionDummy.position.set(
    x + directionX * glassOriginAlong + depthOffset.x,
    y + directionY * glassOriginAlong + depthOffset.y,
    z + depthOffset.z,
  );
  _haloProjectionDummy.updateMatrix();

  _haloCenterWorld
    .set(0, BULB_PROFILE.centerY, 0)
    .applyMatrix4(_haloProjectionDummy.matrix)
    .applyMatrix4(group.matrixWorld);
  _haloEdgeWorld
    .set(BULB_PROFILE.radiusX, BULB_PROFILE.centerY, 0)
    .applyMatrix4(_haloProjectionDummy.matrix)
    .applyMatrix4(group.matrixWorld);
  _haloTipWorld
    .set(0, BULB_PROFILE.minY, 0)
    .applyMatrix4(_haloProjectionDummy.matrix)
    .applyMatrix4(group.matrixWorld);
  _haloNeckWorld
    .set(0, GLASS_SOCKET_OCCLUSION_Y, 0)
    .applyMatrix4(_haloProjectionDummy.matrix)
    .applyMatrix4(group.matrixWorld);

  _haloCenterScreen.copy(_haloCenterWorld).project(camera);
  _haloEdgeScreen.copy(_haloEdgeWorld).project(camera);
  _haloTipScreen.copy(_haloTipWorld).project(camera);
  _haloNeckScreen.copy(_haloNeckWorld).project(camera);

  if (
    !isFiniteVector3(_haloCenterScreen)
    || !isFiniteVector3(_haloEdgeScreen)
    || !isFiniteVector3(_haloTipScreen)
    || !isFiniteVector3(_haloNeckScreen)
  ) {
    return;
  }

  const centerUvX = _haloCenterScreen.x * 0.5 + 0.5;
  const centerUvY = _haloCenterScreen.y * 0.5 + 0.5;
  const edgeUvX = _haloEdgeScreen.x * 0.5 + 0.5;
  const edgeUvY = _haloEdgeScreen.y * 0.5 + 0.5;
  const tipUvX = _haloTipScreen.x * 0.5 + 0.5;
  const tipUvY = _haloTipScreen.y * 0.5 + 0.5;
  const neckUvX = _haloNeckScreen.x * 0.5 + 0.5;
  const neckUvY = _haloNeckScreen.y * 0.5 + 0.5;

  pushBulbHalo(centerUvX, centerUvY, edgeUvX, edgeUvY, tipUvX, tipUvY, neckUvX, neckUvY, colorHex, intensity);
}

function isFiniteVector3(value: Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function createBillboardGeometries(): BillboardGeometries {
  const glass = new ShapeGeometry(createBulbGlassShape(), 12);

  const filamentShape = new Shape();
  const coilWidth = 0.1;
  const coilHeight = 1.2;
  const loops = 3;
  const amplitude = 0.28;
  const segments = 50;
  filamentShape.moveTo(-coilWidth / 2, coilHeight / 2);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const y = coilHeight / 2 - t * coilHeight;
    const x = Math.sin(t * loops * Math.PI * 2) * amplitude - coilWidth / 2;
    filamentShape.lineTo(x, y);
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const y = coilHeight / 2 - t * coilHeight;
    const x = Math.sin(t * loops * Math.PI * 2) * amplitude + coilWidth / 2;
    filamentShape.lineTo(x, y);
  }
  filamentShape.lineTo(-coilWidth / 2, coilHeight / 2);

  const filament = new ShapeGeometry(filamentShape, 1);

  const socketShape = new Shape();
  socketShape.moveTo(-0.48, 0);
  socketShape.bezierCurveTo(-0.47, 0.4, -0.4, 0.8, -0.15, SOCKET_SHAPE_TOP_Y);
  socketShape.lineTo(0.15, SOCKET_SHAPE_TOP_Y);
  socketShape.bezierCurveTo(0.4, 0.8, 0.47, 0.4, 0.48, 0);
  socketShape.lineTo(-0.48, 0);

  const socket = new ShapeGeometry(socketShape, 8);
  const halo = new PlaneGeometry(1, 1, 1, 1);

  return { glass, filament, socket, halo };
}

function createHaloMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: `
      attribute vec3 instanceColor;
      attribute float instanceIntensity;

      varying vec2 vUv;
      varying vec3 vColor;
      varying float vIntensity;

      void main() {
        vUv = uv;
        vColor = instanceColor;
        vIntensity = instanceIntensity;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vIntensity;

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float radialDistance = length(p);
        float outer = smoothstep(1.0, 0.0, radialDistance);
        float softHalo = pow(outer, 1.85);
        float core = exp(-radialDistance * radialDistance * 7.0);
        float alpha = (softHalo * 0.5 + core * 0.18) * vIntensity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

function createGlassMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      baseOpacity: { value: 0.15 },
      baseEmissiveIntensity: { value: 9 },
      // Baseline brightness of the glass dome ("fake ambient"). The custom
      // shader doesn't sample the Three.js lighting uniforms, so we inject
      // the scene's AMBIENT_INTENSITY explicitly — otherwise the ambient
      // slider only ever changed the wire and the bulbs looked detached
      // from the rest of the scene's lighting.
      uAmbient: { value: 1.0 },
      // In MeshStandardMaterial, roughness controls the GGX microfacet lobe.
      // This dome is a custom ShaderMaterial — we map GLASS_ROUGHNESS to
      // specular exponent + strength (see fragment shader).
      uGlassRoughness: { value: 0 },
    },
    vertexShader: `
      attribute vec3 instanceColor;
      attribute float instanceEmissive;

      varying vec3 vColor;
      varying float vEmissive;
      varying vec3 vLocalPos;
      varying vec3 vViewPos;

      void main() {
        vColor = instanceColor;
        vEmissive = instanceEmissive;
        vLocalPos = position;

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vViewPos = mvPosition.xyz;

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float baseOpacity;
      uniform float baseEmissiveIntensity;
      uniform float uAmbient;
      uniform float uGlassRoughness;

      varying vec3 vColor;
      varying float vEmissive;
      varying vec3 vLocalPos;
      varying vec3 vViewPos;

      vec3 saturateColor(vec3 color, float amount) {
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        return max(vec3(0.0), mix(vec3(luma), color, amount));
      }

      vec3 preserveHueCap(vec3 color, float capValue) {
        float maxChannel = max(max(color.r, color.g), color.b);
        if (maxChannel <= capValue) return color;
        return color * (capValue / maxChannel);
      }

      void main() {
        vec3 bulbColor = saturateColor(vColor, 2.05);
        vec2 bulbUv = vec2(
          clamp(vLocalPos.x / 0.55, -1.0, 1.0),
          clamp((vLocalPos.y + 1.3) / 1.3, -1.0, 1.0)
        );

        float r2 = dot(bulbUv, bulbUv);
        float domeHeight = 1.0 - r2;
        float z = sqrt(max(0.01, domeHeight));
        vec3 domeNormal = normalize(vec3(bulbUv.x * 0.82, bulbUv.y * 0.62, z));

        float NdotV = max(0.0, dot(domeNormal, vec3(0.0, 0.0, 1.0)));
        float highlight = pow(NdotV, 1.35);
        float rimPower = 2.0 + uGlassRoughness * 4.0;
        float rim = pow(1.0 - NdotV, rimPower);
        float topLight = max(0.0, dot(domeNormal, normalize(vec3(0.0, 0.5, 1.0))));

        float vertical = bulbUv.y * 0.5 + 0.5;
        float side = abs(bulbUv.x);
        float edgeThickness = smoothstep(0.42, 0.98, sqrt(max(r2, 0.0)));
        float shoulder = smoothstep(0.62, 0.92, vertical) * (1.0 - smoothstep(0.72, 1.0, side));
        float bottomWeight = smoothstep(0.18, 0.0, vertical);
        float centerGlow = exp(-(bulbUv.x * bulbUv.x * 3.2 + (bulbUv.y + 0.1) * (bulbUv.y + 0.1) * 1.35));
        float sideCaustic = exp(-pow(abs(side - 0.42), 2.0) * 42.0) * smoothstep(0.05, 0.5, vertical);

        float lighting = uAmbient * 0.22 + topLight * 0.3 + highlight * 0.34;
        float internalGlow = clamp(baseEmissiveIntensity / 20.0, 0.0, 5.0);
        float visibleEmission = vEmissive * internalGlow * 2.0;
        float bodyLight = 0.16 + lighting * 0.16 + visibleEmission * (0.96 + centerGlow * 0.76);
        vec3 finalColor = bulbColor * bodyLight;

        finalColor += bulbColor * centerGlow * visibleEmission * 0.38;
        finalColor += bulbColor * edgeThickness * (0.16 + visibleEmission * 0.2);
        finalColor += bulbColor * sideCaustic * (0.08 + visibleEmission * 0.14);
        finalColor -= bulbColor * shoulder * 0.055;
        finalColor -= bulbColor * bottomWeight * 0.065;

        vec3 specLight = normalize(vec3(-0.25, 0.32, 1.0));
        // Wider highlight when “rough” (higher GLASS_ROUGHNESS), matching the
        // idea of PBR roughness without a full GGX implementation.
        float specPower = mix(4.0, 74.0, 1.0 - uGlassRoughness);
        float specular = pow(max(0.0, dot(domeNormal, specLight)), specPower);
        float glint = exp(-pow(bulbUv.x + 0.34, 2.0) * 90.0 - pow(bulbUv.y - 0.35, 2.0) * 22.0);
        float specScale = 0.1 * (1.0 - 0.55 * uGlassRoughness);
        finalColor += mix(bulbColor, vec3(1.0), 0.12) * (specular + glint * 0.45) * specScale;
        finalColor += bulbColor * rim * (0.18 + visibleEmission * 0.1);
        finalColor = preserveHueCap(finalColor, 10.0);

        float glassAlpha = baseOpacity * (
          0.58
          + edgeThickness * 0.28
          + centerGlow * 0.1
          + rim * 0.16
        );
        gl_FragColor = vec4(finalColor, clamp(glassAlpha, 0.0, baseOpacity));
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: true,
  });
}

function createFilamentMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      baseEmissiveIntensity: { value: 1.0 },
    },
    vertexShader: `
      attribute vec3 instanceColor;
      attribute float instanceEmissive;

      varying vec3 vColor;
      varying float vEmissive;

      void main() {
        vColor = instanceColor;
        vEmissive = instanceEmissive;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float baseEmissiveIntensity;

      varying vec3 vColor;
      varying float vEmissive;

      vec3 saturateColor(vec3 color, float amount) {
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        return max(vec3(0.0), mix(vec3(luma), color, amount));
      }

      vec3 preserveHueCap(vec3 color, float capValue) {
        float maxChannel = max(max(color.r, color.g), color.b);
        if (maxChannel <= capValue) return color;
        return color * (capValue / maxChannel);
      }

      void main() {
        vec3 filamentColor = saturateColor(vColor, 1.8);
        float internalGlow = pow(clamp(baseEmissiveIntensity / 20.0, 0.0, 1.0), 0.85);
        float visibleEmission = vEmissive * internalGlow * 1.15;
        gl_FragColor = vec4(preserveHueCap(filamentColor * visibleEmission, 1.6), 1.0);
      }
    `,
    side: DoubleSide,
    depthWrite: true,
  });
}

function createSocketMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      // Same ambient injection as the glass shader — otherwise the scene
      // ambient slider has no visible effect on sockets.
      uAmbient: { value: 1.0 },
      uExactColorMode: { value: 0.0 },
      uMetalness: { value: 0.0 },
      uPPos: { value: Array.from({ length: POINT_SPILL_MAX }, () => new Vector3()) },
      uPCol: { value: Array.from({ length: POINT_SPILL_MAX }, () => new Color(0, 0, 0)) },
      uPCount: { value: 0 },
      uPointRange: { value: 1.45 },
    },
    vertexShader: `
      attribute vec3 instanceColor;

      varying vec3 vColor;
      varying vec3 vLocalPos;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;

      void main() {
        vColor = instanceColor;
        vLocalPos = position;

        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vViewPos = mvPosition.xyz;

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uAmbient;
      uniform float uExactColorMode;
      uniform float uMetalness;
      uniform vec3 uPPos[${POINT_SPILL_MAX}];
      uniform vec3 uPCol[${POINT_SPILL_MAX}];
      uniform float uPCount;
      uniform float uPointRange;

      varying vec3 vColor;
      varying vec3 vLocalPos;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;

      float sparkleNoise(vec3 value) {
        return fract(sin(dot(value, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      }

      float socketBand(float value, float center, float width) {
        float aa = max(fwidth(value) * 1.4, 0.003);
        return 1.0 - smoothstep(width - aa, width + aa, abs(value - center));
      }

      vec3 socketPointTerm(vec3 wpos, vec3 lpos, vec3 lcol, float facing) {
        vec3 toL = lpos - wpos;
        float d = length(toL);
        float range = max(uPointRange, 0.001);
        float falloff = pow(max(0.0, 1.0 - d / range), 1.55);
        return lcol * falloff * facing * 0.045;
      }

      void main() {
        if (uExactColorMode > 0.5) {
          gl_FragColor = vec4(vColor, 1.0);
          return;
        }

        vec2 socketUv = vec2(
          clamp(vLocalPos.x / 0.48, -1.0, 1.0),
          clamp(vLocalPos.y / ${SOCKET_SHAPE_TOP_Y.toFixed(2)}, 0.0, 1.0)
        );

        float side = abs(socketUv.x);
        float barrelZ = sqrt(max(0.025, 1.0 - side * side));
        vec3 socketNormal = normalize(vec3(
          socketUv.x * 0.88,
          (socketUv.y - 0.45) * 0.14,
          barrelZ
        ));
        vec3 viewDir = normalize(-vViewPos);

        float NdotV = max(0.0, dot(socketNormal, viewDir));
        float faceLight = pow(NdotV, 0.6);
        float sideRolloff = mix(0.52, 1.0, pow(max(0.0, 1.0 - side), 0.72));
        float topFalloff = mix(1.0, 0.84, smoothstep(0.78, 1.0, socketUv.y));
        float bottomFalloff = mix(0.88, 1.0, smoothstep(0.0, 0.18, socketUv.y));

        float upperLip = socketBand(socketUv.y, 0.88, 0.045);
        float lowerLip = socketBand(socketUv.y, 0.16, 0.05);
        float lipMask = (upperLip * 0.8 + lowerLip * 0.65) * (1.0 - side * 0.38);
        float lipShadow = socketBand(socketUv.y, 0.78, 0.026) * 0.055
          + socketBand(socketUv.y, 0.24, 0.024) * 0.04;

        float baseLight = max(0.24, uAmbient * 0.38) + faceLight * 0.48;
        vec3 finalColor = vColor * baseLight * sideRolloff * topFalloff * bottomFalloff;
        finalColor += vColor * lipMask * (0.08 + 0.08 * uMetalness);
        finalColor -= vColor * lipShadow;

        float spillFacing = 0.35 + 0.65 * NdotV;
        vec3 pAcc = vec3(0.0);
        ${SOCKET_POINT_SPILL_ACCUMULATION}

        vec3 reflectDir = reflect(-viewDir, socketNormal);
        float specPower = mix(10.0, 24.0, uMetalness);
        float specular = pow(max(0.0, dot(reflectDir, normalize(vec3(-0.18, 0.34, 1.0)))), specPower);
        float spillPeak = max(max(pAcc.r, pAcc.g), pAcc.b);
        vec3 spillTint = spillPeak <= 0.0001 ? vec3(0.0) : pAcc / spillPeak;
        vec3 spill = spillTint * (1.0 - exp(-spillPeak * 0.82));
        float baseLum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
        float spillStrength = mix(0.105, 0.265, clamp(baseLum, 0.0, 1.0))
          * mix(1.0, 1.42, clamp(uMetalness, 0.0, 1.0));
        vec3 socketSpillWash = spill * spillStrength * (0.54 + faceLight * 0.22);
        vec3 socketSpillHighlight = spill * (specular * (0.11 + 0.16 * uMetalness) + lipMask * 0.052);

        float materialGrain = sparkleNoise(vec3(vLocalPos.xy * 46.0, dot(vColor, vec3(0.333)))) - 0.5;
        finalColor *= 1.0 + materialGrain * mix(0.025, 0.07, uMetalness);

        float metalSparkle = 0.0;
        if (uMetalness > 0.0) {
          float sparkleSeed = sparkleNoise(vec3(vLocalPos.xy * 38.0, dot(pAcc, vec3(0.33))));
          float sparkleMask = smoothstep(0.77, 0.98, sparkleSeed);
          float metalGlint = pow(max(0.0, dot(reflectDir, normalize(vec3(-0.25, 0.45, 1.0)))), 22.0);
          metalSparkle = sparkleMask * (0.25 + metalGlint) * min(1.0, dot(spill, vec3(0.333)) * 2.5);
        }
        vec3 metalTint = mix(spill, spill + vColor * 0.35, 0.45);
        finalColor += socketSpillWash + socketSpillHighlight;
        finalColor += metalTint * metalSparkle * 0.42 * uMetalness;
        finalColor += mix(vColor, vec3(1.0), 0.22 + 0.22 * uMetalness) * specular * (0.035 + 0.12 * uMetalness);

        gl_FragColor = vec4(max(finalColor, vec3(0.01)), 1.0);
      }
    `,
    side: DoubleSide,
    depthWrite: true,
    depthTest: true,
  });
}
