import { useEffect } from 'react';
import { Scene } from '~/scene/Scene.tsx';
import { useConfigStore } from '~/stores/useConfigStore.ts';

/**
 * OBS browser-source target. No UI chrome, transparent background.
 */
export function Overlay() {
  const hydrate = useConfigStore((s) => s.hydrate);
  const connectWs = useConfigStore((s) => s.connectWs);
  const disconnectWs = useConfigStore((s) => s.disconnectWs);
  const hydrated = useConfigStore((s) => s.hydrated);

  useEffect(() => {
    document.body.classList.add('overlay-mode');
    void hydrate();
    connectWs();
    return () => {
      document.body.classList.remove('overlay-mode');
      disconnectWs();
    };
  }, [hydrate, connectWs, disconnectWs]);

  return (
    <div className="overlay-canvas-root fixed inset-0">
      <Scene />
      {!hydrated && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--color-text-dim)]">
          waiting for config...
        </div>
      )}
    </div>
  );
}
