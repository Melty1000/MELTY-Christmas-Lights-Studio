import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { MeltShell } from '~/components/layout/MeltShell.tsx';
import { useConfigStore } from '~/stores/useConfigStore.ts';

export function ControlPanel() {
  const hydrate = useConfigStore((s) => s.hydrate);
  const connectWs = useConfigStore((s) => s.connectWs);
  const disconnectWs = useConfigStore((s) => s.disconnectWs);

  useEffect(() => {
    void hydrate();
    connectWs();
    return () => disconnectWs();
  }, [hydrate, connectWs, disconnectWs]);

  return (
    <MeltShell>
      <Outlet />
    </MeltShell>
  );
}
