import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  type Camera,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { createBulbAnimationState, stepBulbAnimation, type BulbAnimationState } from './animation.ts';
import { beginPointSpillFrame, pushPointSpill } from './wire/pointSpillState.ts';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { getBulbPalette } from './utils.ts';
import {
  BILLBOARD_OFFSETS,
  SEPARATION_COMPENSATION_SCALE,
  SOCKET_SHAPE_TOP_Y,
  type BillboardInstanceOffset,
} from './bulbMetrics.ts';

export interface BillboardBulbDatum {
  baseColorHex: number;
  position: [number, number, number];
  direction: [number, number, number];
  socketColorHex: number;
}

interface BillboardBulbsProps {
  bulbs: BillboardBulbDatum[];
  themePalette: number[];
  // POINT_LIGHTS_ENABLED is structural — it decides whether the pointLight
  // subtree is mounted at all. All other config values (BULB_SCALE,
  // GLASS_OPACITY, EMISSIVE_INTENSITY, AMBIENT_INTENSITY, animation params)
  // are read imperatively each frame via useConfigStore.getState() so that
  // dragging those sliders doesn't cause any React reconciliation here.
  pointLightsEnabled: boolean;
  separationCompensation: number;
  resetPointSpill?: boolean;
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
const _depthOri = new Object3D();
const _lookAtTarget = new Vector3();
const _offsetVec = new Vector3();
const _assemblyDepthWorld = new Vector3();
const _pointLightWorld = new Vector3();
const _animatedColor = new Color();
const _haloColor = new Color();
const _socketColor = new Color();
const _filamentColor = new Color();

// ---------------------------------------------------------------------------
// "Reflections" (per-bulb point lights)
// ---------------------------------------------------------------------------
// In the legacy app this feature was labeled "Reflections" in the UI — the
// POINT_LIGHTS_ENABLED toggle drives colored per-bulb point lights that spill
// onto the wire: Three.js point lights plus a matching hand-written spill
// in `createWireMaterial` (ShaderMaterial). Billboards are custom shaders too.
// Tuning notes below reflect the constraints of this scene specifically — not
// generic point light physics.

// Three.js compiles point lights into the shader program at the declared
// maximum count, and large counts blow out uniform budgets / mobile tiled
// renderers. 80 is a safe cap that still gives dense strands noticeable spill.
const MAX_POINT_LIGHTS = 80;

// Three.js has been physically-correct-by-default since r155 (intensity is in
// candela). A Christmas-bulb-sized emitter at ~0.2m glass reads around
// 30-40cd. We then multiply by per-bulb animation.intensity (0..1) so dim
// bulbs cast less spill. Anything much higher blows the bloom threshold and
// the wire turns into a solid glowing sausage.
const POINT_LIGHT_INTENSITY = 32;

// Distance is a hard cutoff — we want each bulb's spill to land on the wire
// section immediately around it but NOT reach past the neighboring bulb (or
// the wire becomes a uniform smear with no color separation). With ~0.6 world
// units between bulbs, 0.9 lets neighbors overlap slightly without washing.
const POINT_LIGHT_DISTANCE = 0.9;
const POINT_LIGHT_DECAY = 2;

// Vertical offset from the bulb's attachment point (socket/wire junction) up
// into the glass body. Placing the light here, rather than at the exact wire
// position, pushes the brightest spill DOWN onto the wire so the effect is
// visible from the usual viewing angle instead of being hidden inside the
// wire geometry. ~0.3 in legacy local space; here we scale with BULB_SCALE.
const POINT_LIGHT_VERTICAL_OFFSET = 0.3;

const HALO_CENTER_OFFSET_Y = -2.7;
const HALO_DEPTH_OFFSET = -0.16;
const HALO_BASE_SCALE = 4.5;
const HALO_RADIUS_SCALE = 12.0;
const HALO_MAX_INTENSITY = 1.15;
const HALO_INTENSITY_FLOOR = 0.32;
const HALO_RESPONSE_CURVE = 3.2;
const BULB_OFF_INTENSITY_EPSILON = 0.001;

export function BillboardBulbs({
  bulbs,
  themePalette,
  pointLightsEnabled,
  separationCompensation,
  resetPointSpill = true,
}: BillboardBulbsProps) {
  const glassRef = useRef<InstancedMesh>(null);
  const filamentRef = useRef<InstancedMesh>(null);
  const socketRef = useRef<InstancedMesh>(null);
  const haloRef = useRef<InstancedMesh>(null);
  const animationStatesRef = useRef<BulbAnimationState[]>([]);
  const pointLightRefs = useRef<Array<PointLight | null>>([]);
  const geometries = useMemo(createBillboardGeometries, []);
  const glassMaterial = useMemo(createGlassMaterial, []);
  const filamentMaterial = useMemo(createFilamentMaterial, []);
  const socketMaterial = useMemo(createSocketMaterial, []);
  const haloMaterial = useMemo(createHaloMaterial, []);

  const pointLightCount = pointLightsEnabled ? Math.min(bulbs.length, MAX_POINT_LIGHTS) : 0;

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
    const glass = glassRef.current;
    const filament = filamentRef.current;
    const socket = socketRef.current;
    const halo = haloRef.current;
    if (!glass || !filament || !socket || !halo) return;

    // Pull the live config every frame. Zero React overhead — this is just
    // a ref read, so every continuous slider (bulb scale, emissive, glass
    // opacity, ambient, animation speeds/styles) updates on the next GL
    // frame without re-rendering the scene graph.
    const config = useConfigStore.getState().config;
    if (resetPointSpill) beginPointSpillFrame();

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

    const tWire = config.WIRE_THICKNESS;
    // Same camera-space +Z (billboard "depth") for glass, filament, socket, lights.
    // Thinner ribbon and zoomed-out camera: push the cap stack toward the lens
    // so dips stay behind the gold shell (log-Z precision + parallax both hurt).
    const inv = 0.03 / (tWire + 0.0055);
    const distScale = 1.0 + 0.07 * Math.max(0, config.CAMERA_DISTANCE - 8);
    const zBoost = Math.min(
      0.4,
      (0.02 + 0.2 * Math.min(2.2, inv) + 0.08 * Math.min(1, inv * inv * 0.04)) * distScale,
    );

    const elapsed = clock.getElapsedTime();
    const haloStrength = config.POSTFX_ENABLED
      ? computeHaloStrength(config.BLOOM_STRENGTH, config.BLOOM_INTENSITY)
      : 0;
    const haloScale = config.BULB_SCALE * (HALO_BASE_SCALE + config.BLOOM_RADIUS * HALO_RADIUS_SCALE);
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

      const palette = getBulbPalette(animation.colorHex);
      const [x, y, z] = bulb.position;
      const [dirX, dirY] = bulb.direction;

      // Y-locked look-at (cylindrical): reduces edge-of-screen X drift vs full
      // screen-facing billboards. Depth boost matches this basis per bulb.
      _lookAtTarget.set(camera.position.x, y, camera.position.z);
      _depthOri.position.set(x, y, z);
      _depthOri.lookAt(_lookAtTarget);
      _assemblyDepthWorld.set(0, 0, zBoost);
      _assemblyDepthWorld.applyQuaternion(_depthOri.quaternion);

      writeInstance(
        glass,
        index,
        _glassDummy,
        camera,
        x,
        y,
        z,
        config.BULB_SCALE,
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
        config.BULB_SCALE,
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
        config.BULB_SCALE,
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
        config.BULB_SCALE,
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
      const haloIntensity = animation.intensity <= BULB_OFF_INTENSITY_EPSILON
        ? 0
        : HALO_INTENSITY_FLOOR + animation.intensity * (1 - HALO_INTENSITY_FLOOR);
      haloIntensityAttr.setX(
        index,
        haloStrength * haloIntensity,
      );

      // Drive the optional per-bulb point light for colored spill onto the
      // wire ribbon. Capped earlier via pointLightCount. The light's y is
      // lifted above the attachment point each frame in case BULB_SCALE
      // changed — keeps the brightest spill aimed DOWN onto the wire.
      if (index < pointLightCount) {
        const light = pointLightRefs.current[index];
        if (light) {
          light.color.setHex(animation.colorHex);
          light.intensity = POINT_LIGHT_INTENSITY * animation.intensity;
          const lightOutwardOffset = POINT_LIGHT_VERTICAL_OFFSET * config.BULB_SCALE + outwardOffset;
          const lpx = x + dirX * lightOutwardOffset + _assemblyDepthWorld.x;
          const lpy = y + dirY * lightOutwardOffset + _assemblyDepthWorld.y;
          const lpz = z + _assemblyDepthWorld.z;
          light.position.set(lpx, lpy, lpz);
          light.getWorldPosition(_pointLightWorld);
          pushPointSpill(
            _pointLightWorld.x,
            _pointLightWorld.y,
            _pointLightWorld.z,
            animation.colorHex,
            POINT_LIGHT_INTENSITY * animation.intensity,
          );
        }
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
    (glassMaterial.uniforms.baseEmissiveIntensity!).value = config.EMISSIVE_INTENSITY;
    (glassMaterial.uniforms.uAmbient!).value = config.AMBIENT_INTENSITY;
    (glassMaterial.uniforms.uGlassRoughness!).value = config.GLASS_ROUGHNESS;
    (socketMaterial.uniforms.uAmbient!).value = config.AMBIENT_INTENSITY;
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
    <group>
      <instancedMesh ref={socketRef} args={[geometries.socket, socketMaterial, bulbs.length]} renderOrder={0} />
      <instancedMesh ref={haloRef} args={[geometries.halo, haloMaterial, bulbs.length]} renderOrder={4} />
      <instancedMesh ref={glassRef} args={[geometries.glass, glassMaterial, bulbs.length]} renderOrder={10} />
      <instancedMesh ref={filamentRef} args={[geometries.filament, filamentMaterial, bulbs.length]} renderOrder={11} />
      {pointLightCount > 0 ? (
        <PointLightStrand
          bulbs={bulbs}
          pointLightCount={pointLightCount}
          pointLightRefs={pointLightRefs}
          separationCompensation={separationCompensation}
        />
      ) : null}
    </group>
  );
}

// Point-light strand is extracted so it can be memoized on just `bulbs` and
// `pointLightCount`. BillboardBulbs itself rerenders only when structural
// fields change (which is rare), so in practice this memo mostly guards
// against strand count / bulb-array changes rather than continuous sliders.
const PointLightStrand = ({
  bulbs,
  pointLightCount,
  pointLightRefs,
  separationCompensation,
}: {
  bulbs: BillboardBulbDatum[];
  pointLightCount: number;
  pointLightRefs: React.MutableRefObject<Array<PointLight | null>>;
  separationCompensation: number;
}) => {
  // Seed Y with current BULB_SCALE so the very first frame (before useFrame
  // runs) doesn't render the lights sunk into the wire.
  const initialScale = useConfigStore.getState().config.BULB_SCALE;
  const initialOutwardOffset = (
    POINT_LIGHT_VERTICAL_OFFSET * initialScale
    + separationCompensation * SEPARATION_COMPENSATION_SCALE
  );
  return (
    <>
      {bulbs.slice(0, pointLightCount).map((bulb, index) => (
        <pointLight
          key={`pl-${index}`}
          ref={(light) => {
            pointLightRefs.current[index] = light;
          }}
          position={[
            bulb.position[0] + bulb.direction[0] * initialOutwardOffset,
            bulb.position[1] + bulb.direction[1] * initialOutwardOffset,
            bulb.position[2],
          ]}
          distance={POINT_LIGHT_DISTANCE}
          decay={POINT_LIGHT_DECAY}
          intensity={0}
          color={bulb.baseColorHex}
        />
      ))}
    </>
  );
};

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
  _offsetVec.set(0, offset.y * scale, offset.z);
  _offsetVec.applyQuaternion(dummy.quaternion);
  dummy.position.set(
    x + _offsetVec.x + directionX * outwardOffset,
    y + _offsetVec.y + directionY * outwardOffset,
    z + _offsetVec.z,
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
  _offsetVec.set(0, offset.y * bulbScale, offset.z);
  _offsetVec.applyQuaternion(dummy.quaternion);
  dummy.position.set(
    x + _offsetVec.x + directionX * outwardOffset,
    y + _offsetVec.y + directionY * outwardOffset,
    z + _offsetVec.z,
  );
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function computeHaloStrength(strength: number, intensity: number): number {
  const raw = Math.max(0, strength) * Math.max(0, intensity);
  if (raw <= 0) return 0;
  return HALO_MAX_INTENSITY * (1 - Math.exp(-raw / HALO_RESPONSE_CURVE));
}

function createBillboardGeometries(): BillboardGeometries {
  const glassShape = new Shape();
  glassShape.moveTo(-0.22, 0);
  glassShape.bezierCurveTo(-0.45, 0, -0.55, -0.5, -0.55, -0.9);
  glassShape.bezierCurveTo(-0.55, -1.5, -0.35, -2.2, 0.0, -2.6);
  glassShape.bezierCurveTo(0.35, -2.2, 0.55, -1.5, 0.55, -0.9);
  glassShape.bezierCurveTo(0.55, -0.5, 0.45, 0, 0.22, 0);
  glassShape.lineTo(-0.22, 0);
  const glass = new ShapeGeometry(glassShape, 12);

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
        float d = length(p);
        float outer = smoothstep(1.0, 0.0, d);
        float halo = pow(outer, 2.15);
        float core = exp(-d * d * 8.0);
        float alpha = (halo * 0.5 + core * 0.24) * vIntensity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vColor * alpha, alpha);
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
        vec3 bulbColor = saturateColor(vColor, 1.9);
        vec2 normalized = vec2(
          vLocalPos.x / 0.55,
          (vLocalPos.y + 1.3) / 1.3
        );

        float r2 = dot(normalized, normalized);
        float domeHeight = 1.0 - r2;
        float z = sqrt(max(0.01, domeHeight));
        vec3 domeNormal = normalize(vec3(normalized.x * 0.8, normalized.y * 0.8, z));

        float NdotV = max(0.0, dot(domeNormal, vec3(0.0, 0.0, 1.0)));
        float highlight = pow(NdotV, 1.5);
        float rimPower = 2.0 + uGlassRoughness * 4.0;
        float rim = pow(1.0 - NdotV, rimPower) * 0.5;
        float topLight = max(0.0, dot(domeNormal, normalize(vec3(0.0, 0.5, 1.0))));
        float lighting = uAmbient * 0.3 + topLight * 0.4 + highlight * 0.6;

        float visibleEmission = min(vEmissive * baseEmissiveIntensity, 1.35);
        vec3 finalColor = bulbColor * (0.28 + lighting * 0.18 + visibleEmission * 0.82);

        vec3 specLight = normalize(vec3(0.2, 0.3, 1.0));
        // Wider highlight when “rough” (higher GLASS_ROUGHNESS), matching the
        // idea of PBR roughness without a full GGX implementation.
        float specPower = mix(2.0, 56.0, 1.0 - uGlassRoughness);
        float specular = pow(max(0.0, dot(domeNormal, specLight)), specPower);
        float specScale = 0.08 * (1.0 - 0.45 * uGlassRoughness);
        finalColor += mix(bulbColor, vec3(1.0), 0.04) * specular * specScale;
        finalColor += bulbColor * rim * 0.2;
        finalColor = preserveHueCap(finalColor, 1.45);

        gl_FragColor = vec4(finalColor, baseOpacity);
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
        float visibleEmission = min(vEmissive * baseEmissiveIntensity, 1.6);
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
    },
    vertexShader: `
      attribute vec3 instanceColor;

      varying vec3 vColor;
      varying vec3 vLocalPos;
      varying vec3 vViewPos;

      void main() {
        vColor = instanceColor;
        vLocalPos = position;

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vViewPos = mvPosition.xyz;

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uAmbient;

      varying vec3 vColor;
      varying vec3 vLocalPos;
      varying vec3 vViewPos;

      void main() {
        vec2 normalized = vec2(
          vLocalPos.x / 0.48,
          (vLocalPos.y - 0.575) / 0.575
        );

        float r2 = dot(normalized, normalized);
        float domeHeight = 1.0 - r2;
        float z = sqrt(max(0.01, domeHeight));
        vec3 domeNormal = normalize(vec3(normalized.x * 0.6, normalized.y * 0.6, z));
        vec3 viewDir = normalize(-vViewPos);

        float NdotV = max(0.0, dot(domeNormal, viewDir));
        float highlight = pow(NdotV, 1.5);
        float topLight = max(0.0, dot(domeNormal, normalize(vec3(0.0, 0.5, 1.0))));
        float lighting = uAmbient * 0.4 + topLight * 0.3 + highlight * 0.4;
        vec3 finalColor = vColor * lighting;

        vec3 reflectDir = reflect(-viewDir, domeNormal);
        float specular = pow(max(0.0, dot(reflectDir, normalize(vec3(0.2, 0.3, 1.0)))), 6.0);
        finalColor += vec3(specular * 0.2);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: DoubleSide,
    depthWrite: true,
    depthTest: true,
  });
}
