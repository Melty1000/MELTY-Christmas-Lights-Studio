import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { BulbHaloEffect } from './BulbHaloEffect.ts';

export function BulbHalo() {
  const effect = useMemo(() => new BulbHaloEffect(), []);
  const size = useThree((state) => state.size);

  useFrame(() => {
    const c = useConfigStore.getState().config;
    effect.sync({
      enabled: true,
      strength: c.HALO_STRENGTH,
      radius: c.HALO_RADIUS,
      intensity: c.HALO_INTENSITY,
      width: size.width,
      height: size.height,
    });
  }, 0.5);

  return <primitive object={effect} dispose={null} />;
}
