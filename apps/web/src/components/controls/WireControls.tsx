import { useConfigStore } from '~/stores/useConfigStore.ts';
import { BoundSlider } from './BoundFields.tsx';
import { Panel, StatusPill } from './ControlPrimitives.tsx';

export function WireSimpleControls() {
  return (
    <>
      <BoundSlider control="WIRE_WEIGHT" />
      <BoundSlider control="TWIST_DENSITY" />
    </>
  );
}

export function AdvancedWireTuningPanel() {
  const wireTuningMode = useConfigStore((s) => s.config.WIRE_TUNING_MODE);

  return (
    <Panel
      title="Advanced Wire Tuning"
      action={<StatusPill label={wireTuningMode === 'ADVANCED' ? 'Active' : 'Fine Tune'} tone="neutral" />}
    >
      <BoundSlider control="ADVANCED_WIRE_THICKNESS" />
      <BoundSlider control="ADVANCED_WIRE_SEPARATION" />
      <BoundSlider control="ADVANCED_WIRE_TWISTS" />
    </Panel>
  );
}
