import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, type MeshBasicMaterial, type MeshPhysicalMaterial, type MeshStandardMaterial, type PointLight } from 'three';
import type { Config } from '@melty/shared';
import { createBulbAnimationState, stepBulbAnimation } from './animation.ts';
import { getBulbPalette } from './utils.ts';

interface BulbProps {
  config: Config;
  baseColorHex: number;
  index: number;
  position: [number, number, number];
  scale: number;
  socketColorHex: number;
  themePalette: number[];
  total: number;
}

const _glassColor = new Color();
const _socketColor = new Color();
const _filamentColor = new Color();

export function Bulb({
  config,
  baseColorHex,
  index,
  position,
  scale,
  socketColorHex,
  themePalette,
  total,
}: BulbProps) {
  const glassRef = useRef<MeshPhysicalMaterial | null>(null);
  const socketRef = useRef<MeshStandardMaterial | null>(null);
  const filamentRef = useRef<MeshBasicMaterial | null>(null);
  const pointLightRef = useRef<PointLight | null>(null);
  const animationStateRef = useRef(createBulbAnimationState(index));

  useEffect(() => {
    animationStateRef.current = createBulbAnimationState(index);
  }, [index, themePalette, baseColorHex, config.ANIMATION_STYLE]);

  useFrame(({ clock }, delta) => {
    const glassMaterial = glassRef.current;
    const socketMaterial = socketRef.current;
    const filamentMaterial = filamentRef.current;

    if (!glassMaterial || !socketMaterial || !filamentMaterial) {
      return;
    }

    const animation = stepBulbAnimation(
      animationStateRef.current,
      config,
      clock.getElapsedTime(),
      delta,
      index,
      total,
      baseColorHex,
      themePalette,
    );

    const palette = getBulbPalette(animation.colorHex);

    _glassColor.setHex(animation.colorHex);
    _socketColor.setHex(socketColorHex);
    _filamentColor.copy(palette.filament).multiplyScalar(0.65 + animation.intensity * 0.75);

    glassMaterial.color.copy(_glassColor);
    glassMaterial.emissive.copy(_glassColor);
    glassMaterial.emissiveIntensity = config.EMISSIVE_INTENSITY * animation.intensity;
    glassMaterial.opacity = Math.max(0.08, config.GLASS_OPACITY);
    glassMaterial.roughness = config.GLASS_ROUGHNESS;
    glassMaterial.ior = config.GLASS_IOR;

    socketMaterial.color.copy(_socketColor);
    filamentMaterial.color.copy(_filamentColor);

    if (pointLightRef.current) {
      pointLightRef.current.color.copy(_glassColor);
      pointLightRef.current.intensity = animation.intensity * 0.85;
    }
  });

  const glassColor = useMemo(() => `#${baseColorHex.toString(16).padStart(6, '0')}`, [baseColorHex]);
  const socketColor = useMemo(() => `#${socketColorHex.toString(16).padStart(6, '0')}`, [socketColorHex]);

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, -0.82, 0]}>
        <capsuleGeometry args={[0.22, 1.05, 4, 10]} />
        <meshPhysicalMaterial
          ref={glassRef}
          color={glassColor}
          emissive={glassColor}
          emissiveIntensity={config.EMISSIVE_INTENSITY}
          metalness={0}
          opacity={config.GLASS_OPACITY}
          roughness={config.GLASS_ROUGHNESS}
          transparent
          ior={config.GLASS_IOR}
          transmission={0.55}
          thickness={0.2}
        />
      </mesh>

      <mesh position={[0, -0.18, 0]}>
        <cylinderGeometry args={[0.11, 0.18, 0.32, 12]} />
        <meshStandardMaterial
          ref={socketRef}
          color={socketColor}
          metalness={0.6}
          roughness={0.28}
        />
      </mesh>

      <mesh position={[0, -0.78, 0.14]}>
        <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
        <meshBasicMaterial ref={filamentRef} color="#fff5d6" />
      </mesh>

      {config.POINT_LIGHTS_ENABLED ? (
        <pointLight
          ref={pointLightRef}
          color={glassColor}
          distance={3.4}
          intensity={0.8}
          position={[0, -0.8, 0.18]}
        />
      ) : null}
    </group>
  );
}
