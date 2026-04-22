import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Points, Vector3 } from 'three';

interface SnowFieldProps {
  count: number;
  speed: number;
  size: number;
  drift: number;
}

const _snowVector = new Vector3();

export function SnowField({ count, speed, size, drift }: SnowFieldProps) {
  const pointsRef = useRef<Points>(null);

  const { geometry, velocities, amplitudes } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const wiggles = new Float32Array(count);

    for (let index = 0; index < count; index++) {
      positions[index * 3] = (Math.random() - 0.5) * 34;
      positions[index * 3 + 1] = Math.random() * 20 - 6;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 16;
      speeds[index] = 0.25 + Math.random() * 0.75;
      wiggles[index] = 0.4 + Math.random() * 1.2;
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute('position', new BufferAttribute(positions, 3));

    return {
      geometry: nextGeometry,
      velocities: speeds,
      amplitudes: wiggles,
    };
  }, [count]);

  useFrame(({ clock }, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const positionAttr = geometry.getAttribute('position') as BufferAttribute;
    const positions = positionAttr.array as Float32Array;
    const elapsed = clock.getElapsedTime();

    for (let index = 0; index < count; index++) {
      const base = index * 3;
      _snowVector.set(positions[base]!, positions[base + 1]!, positions[base + 2]!);
      _snowVector.y -= speed * velocities[index]! * delta * 45;
      _snowVector.x += drift * delta * 2 + Math.sin(elapsed * amplitudes[index]! + index) * delta * 0.15;

      if (_snowVector.y < -8) {
        _snowVector.y = 14 + Math.random() * 4;
        _snowVector.x = (Math.random() - 0.5) * 34;
        _snowVector.z = (Math.random() - 0.5) * 16;
      }

      positions[base] = _snowVector.x;
      positions[base + 1] = _snowVector.y;
      positions[base + 2] = _snowVector.z;
    }

    positionAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#ffffff"
        opacity={0.72}
        size={Math.max(0.002, size)}
        sizeAttenuation
        transparent
        depthWrite={false}
      />
    </points>
  );
}
