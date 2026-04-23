import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Object3D,
  PointLight,
  Quaternion,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { Config } from '@melty/shared';
import { createBulbAnimationState, stepBulbAnimation, type BulbAnimationState } from './animation.ts';
import { getBulbPalette } from './utils.ts';

export interface BillboardBulbDatum {
  baseColorHex: number;
  position: [number, number, number];
  socketColorHex: number;
}

interface BillboardBulbsProps {
  bulbs: BillboardBulbDatum[];
  config: Config;
  themePalette: number[];
}

interface BillboardGeometries {
  glass: ShapeGeometry;
  filament: ShapeGeometry;
  socket: ShapeGeometry;
}

interface BillboardInstanceOffset {
  y: number;
  z: number;
}

const _glassDummy = new Object3D();
const _filamentDummy = new Object3D();
const _socketDummy = new Object3D();
const _billboardQuaternion = new Quaternion();
const _offsetVec = new Vector3();
const _animatedColor = new Color();
const _socketColor = new Color();
const _filamentColor = new Color();

// ---------------------------------------------------------------------------
// "Reflections" (per-bulb point lights)
// ---------------------------------------------------------------------------
// In the legacy app this feature was labeled "Reflections" in the UI — the
// POINT_LIGHTS_ENABLED toggle drives colored per-bulb point lights that spill
// onto the MeshStandardMaterial wire ribbon, which is the only PBR surface in
// the scene (the glass/socket/filament are custom shaders that don't sample
// Three.js lights). Tuning notes below reflect the constraints of this scene
// specifically — not generic point light physics.

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

const BILLBOARD_OFFSETS = {
  filament: { y: -2.2, z: 0.04 } satisfies BillboardInstanceOffset,
  glass: { y: -1.4, z: 0.05 } satisfies BillboardInstanceOffset,
  socket: { y: -1.75, z: 0.06 } satisfies BillboardInstanceOffset,
} as const;

export function BillboardBulbs({ bulbs, config, themePalette }: BillboardBulbsProps) {
  const glassRef = useRef<InstancedMesh>(null);
  const filamentRef = useRef<InstancedMesh>(null);
  const socketRef = useRef<InstancedMesh>(null);
  const animationStatesRef = useRef<BulbAnimationState[]>([]);
  const pointLightRefs = useRef<Array<PointLight | null>>([]);
  const geometries = useMemo(createBillboardGeometries, []);
  const glassMaterial = useMemo(createGlassMaterial, []);
  const filamentMaterial = useMemo(createFilamentMaterial, []);
  const socketMaterial = useMemo(createSocketMaterial, []);

  const pointLightCount = config.POINT_LIGHTS_ENABLED
    ? Math.min(bulbs.length, MAX_POINT_LIGHTS)
    : 0;

  useEffect(() => {
    animationStatesRef.current = bulbs.map((_, index) => animationStatesRef.current[index] ?? createBulbAnimationState(index));
  }, [bulbs]);

  useEffect(() => {
    const glass = glassRef.current;
    const filament = filamentRef.current;
    const socket = socketRef.current;
    if (!glass || !filament || !socket) return;

    glass.instanceMatrix.setUsage(DynamicDrawUsage);
    filament.instanceMatrix.setUsage(DynamicDrawUsage);
    socket.instanceMatrix.setUsage(DynamicDrawUsage);

    glass.geometry.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(bulbs.length * 3), 3));
    glass.geometry.setAttribute('instanceEmissive', new InstancedBufferAttribute(new Float32Array(bulbs.length), 1));
    filament.geometry.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(bulbs.length * 3), 3));
    filament.geometry.setAttribute('instanceEmissive', new InstancedBufferAttribute(new Float32Array(bulbs.length), 1));
    socket.geometry.setAttribute('instanceColor', new InstancedBufferAttribute(new Float32Array(bulbs.length * 3), 3));
  }, [bulbs.length]);

  useFrame(({ camera, clock }, delta) => {
    const glass = glassRef.current;
    const filament = filamentRef.current;
    const socket = socketRef.current;
    if (!glass || !filament || !socket) return;

    const glassColorAttr = glass.geometry.getAttribute('instanceColor') as InstancedBufferAttribute;
    const glassEmissiveAttr = glass.geometry.getAttribute('instanceEmissive') as InstancedBufferAttribute;
    const filamentColorAttr = filament.geometry.getAttribute('instanceColor') as InstancedBufferAttribute;
    const filamentEmissiveAttr = filament.geometry.getAttribute('instanceEmissive') as InstancedBufferAttribute;
    const socketColorAttr = socket.geometry.getAttribute('instanceColor') as InstancedBufferAttribute;

    _billboardQuaternion.copy(camera.quaternion);

    const elapsed = clock.getElapsedTime();
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

      writeInstance(
        glass,
        index,
        _glassDummy,
        _billboardQuaternion,
        x,
        y,
        z,
        config.BULB_SCALE,
        BILLBOARD_OFFSETS.glass,
      );
      writeInstance(
        filament,
        index,
        _filamentDummy,
        _billboardQuaternion,
        x,
        y,
        z,
        config.BULB_SCALE,
        BILLBOARD_OFFSETS.filament,
      );
      writeInstance(
        socket,
        index,
        _socketDummy,
        _billboardQuaternion,
        x,
        y,
        z,
        config.BULB_SCALE,
        BILLBOARD_OFFSETS.socket,
      );

      _animatedColor.setHex(animation.colorHex);
      _filamentColor.copy(palette.filament);
      _socketColor.setHex(bulb.socketColorHex);

      glassColorAttr.setXYZ(index, _animatedColor.r, _animatedColor.g, _animatedColor.b);
      glassEmissiveAttr.setX(index, animation.intensity);

      filamentColorAttr.setXYZ(index, _filamentColor.r, _filamentColor.g, _filamentColor.b);
      filamentEmissiveAttr.setX(index, animation.intensity);

      socketColorAttr.setXYZ(index, _socketColor.r, _socketColor.g, _socketColor.b);

      // Drive the optional per-bulb point light for colored spill onto the
      // wire ribbon. Capped earlier via pointLightCount. The light's y is
      // lifted above the attachment point each frame in case BULB_SCALE
      // changed — keeps the brightest spill aimed DOWN onto the wire.
      if (index < pointLightCount) {
        const light = pointLightRefs.current[index];
        if (light) {
          light.color.setHex(animation.colorHex);
          light.intensity = POINT_LIGHT_INTENSITY * animation.intensity;
          light.position.set(
            x,
            y + POINT_LIGHT_VERTICAL_OFFSET * config.BULB_SCALE,
            z,
          );
        }
      }
    }

    glass.instanceMatrix.needsUpdate = true;
    filament.instanceMatrix.needsUpdate = true;
    socket.instanceMatrix.needsUpdate = true;
    glassColorAttr.needsUpdate = true;
    glassEmissiveAttr.needsUpdate = true;
    filamentColorAttr.needsUpdate = true;
    filamentEmissiveAttr.needsUpdate = true;
    socketColorAttr.needsUpdate = true;

    (glassMaterial.uniforms.baseOpacity!).value = config.GLASS_OPACITY;
    (glassMaterial.uniforms.baseEmissiveIntensity!).value = config.EMISSIVE_INTENSITY;
    (glassMaterial.uniforms.uAmbient!).value = config.AMBIENT_INTENSITY;
    (socketMaterial.uniforms.uAmbient!).value = config.AMBIENT_INTENSITY;
  });

  useEffect(() => {
    return () => {
      geometries.glass.dispose();
      geometries.filament.dispose();
      geometries.socket.dispose();
      glassMaterial.dispose();
      filamentMaterial.dispose();
      socketMaterial.dispose();
    };
  }, [filamentMaterial, geometries, glassMaterial, socketMaterial]);

  return (
    <group>
      <instancedMesh ref={socketRef} args={[geometries.socket, socketMaterial, bulbs.length]} renderOrder={0} />
      <instancedMesh ref={glassRef} args={[geometries.glass, glassMaterial, bulbs.length]} renderOrder={10} />
      <instancedMesh ref={filamentRef} args={[geometries.filament, filamentMaterial, bulbs.length]} renderOrder={11} />
      {pointLightCount > 0
        ? bulbs.slice(0, pointLightCount).map((bulb, index) => (
            <pointLight
              key={`pl-${index}`}
              ref={(light) => {
                pointLightRefs.current[index] = light;
              }}
              // Initial position gets overwritten every frame in useFrame to
              // track BULB_SCALE, but we seed it above the attachment point
              // so the very first frame doesn't render the light sunk into
              // the wire.
              position={[
                bulb.position[0],
                bulb.position[1] + POINT_LIGHT_VERTICAL_OFFSET * config.BULB_SCALE,
                bulb.position[2],
              ]}
              distance={POINT_LIGHT_DISTANCE}
              decay={POINT_LIGHT_DECAY}
              intensity={0}
              color={bulb.baseColorHex}
            />
          ))
        : null}
    </group>
  );
}

function writeInstance(
  mesh: InstancedMesh,
  index: number,
  dummy: Object3D,
  cameraQuaternion: Quaternion,
  x: number,
  y: number,
  z: number,
  scale: number,
  offset: BillboardInstanceOffset,
) {
  _offsetVec.set(0, offset.y * scale, offset.z);
  _offsetVec.applyQuaternion(cameraQuaternion);
  dummy.position.set(x + _offsetVec.x, y + _offsetVec.y, z + _offsetVec.z);
  dummy.quaternion.copy(cameraQuaternion);
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
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
  socketShape.bezierCurveTo(-0.47, 0.4, -0.4, 0.8, -0.15, 1.15);
  socketShape.lineTo(0.15, 1.15);
  socketShape.bezierCurveTo(0.4, 0.8, 0.47, 0.4, 0.48, 0);
  socketShape.lineTo(-0.48, 0);

  const socket = new ShapeGeometry(socketShape, 8);

  return { glass, filament, socket };
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

      varying vec3 vColor;
      varying float vEmissive;
      varying vec3 vLocalPos;
      varying vec3 vViewPos;

      void main() {
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
        float rim = pow(1.0 - NdotV, 2.0) * 0.5;
        float topLight = max(0.0, dot(domeNormal, normalize(vec3(0.0, 0.5, 1.0))));
        float lighting = uAmbient * 0.3 + topLight * 0.4 + highlight * 0.6;

        vec3 emissiveColor = vColor * vEmissive * baseEmissiveIntensity;
        vec3 finalColor = vColor * lighting * 0.5 + emissiveColor;

        float specular = pow(max(0.0, dot(domeNormal, normalize(vec3(0.2, 0.3, 1.0)))), 8.0);
        finalColor += vec3(specular * 0.5);
        finalColor += vColor * rim * 0.3;

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

      void main() {
        gl_FragColor = vec4(vColor * vEmissive * baseEmissiveIntensity, 1.0);
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
