import { ANIMATION_STYLES } from '@melty/shared';
import {
  MetricGrid,
  PageGrid,
  PageIntro,
  PanelCard,
  RangeField,
  SelectField,
  StatusPill,
} from '~/components/controls/ControlPrimitives.tsx';
import { formatToken } from '~/lib/format.ts';
import { useConfigStore } from '~/stores/useConfigStore.ts';

export function Effects() {
  const config = useConfigStore((state) => state.config);
  const patch = useConfigStore((state) => state.patch);

  return (
    <div className="space-y-6 p-6">
      <PageIntro
        title="Motion, twinkle, and rhythm"
        description="After the shape-and-look pass, this page is where the scene stops feeling static. Styles, twinkle range, and sway all patch directly into the overlay."
        actions={<StatusPill label={formatToken(config.ANIMATION_STYLE)} tone="accent" />}
      />

      <MetricGrid
        items={[
          {
            label: 'Style',
            value: formatToken(config.ANIMATION_STYLE),
            detail: 'Global behavior for brightness and palette motion.',
            tone: 'accent',
          },
          {
            label: 'Speed',
            value: config.ANIMATION_SPEED.toFixed(2),
            detail: 'Master pace for chase and fade styles.',
          },
          {
            label: 'Twinkle Range',
            value: `${config.TWINKLE_MIN_INTENSITY.toFixed(2)} - ${config.TWINKLE_MAX_INTENSITY.toFixed(2)}`,
            detail: 'Brightness window for twinkle-driven modes.',
          },
          {
            label: 'Sway',
            value: `X ${config.SWAY_X.toFixed(2)} | Z ${config.SWAY_Z.toFixed(2)}`,
            detail: 'Keeps the string from feeling mechanically locked.',
          },
        ]}
        columns={4}
      />

      <PageGrid>
        <div className="space-y-6">
          <PanelCard
            title="Animation style"
            description="Styles control the global behavior for brightness and, when needed, palette cycling."
          >
            <SelectField
              label="Animation style"
              hint="Soft Twinkle is the current default baseline."
              value={config.ANIMATION_STYLE}
              options={ANIMATION_STYLES.map((name) => ({ label: formatToken(name), value: name }))}
              onChange={(value) => void patch({ ANIMATION_STYLE: value as (typeof ANIMATION_STYLES)[number] })}
            />
            <RangeField
              label="Animation speed"
              hint="Master motion speed for chase, party, and color-fade styles."
              min={0}
              max={5}
              step={0.01}
              value={config.ANIMATION_SPEED}
              onChange={(value) => void patch({ ANIMATION_SPEED: value })}
            />
          </PanelCard>

          <PanelCard
            title="Twinkle envelope"
            description="Controls the way bulbs breathe between dim and bright values."
          >
            <RangeField
              label="Twinkle speed"
              hint="How quickly brightness fluctuations move through the bulbs."
              min={0}
              max={4}
              step={0.01}
              value={config.TWINKLE_SPEED}
              onChange={(value) => void patch({ TWINKLE_SPEED: value })}
            />
            <RangeField
              label="Min intensity"
              hint="Floor for twinkle-based styles."
              min={0}
              max={1}
              step={0.01}
              value={config.TWINKLE_MIN_INTENSITY}
              onChange={(value) => void patch({ TWINKLE_MIN_INTENSITY: value })}
            />
            <RangeField
              label="Max intensity"
              hint="Ceiling for twinkle-based styles."
              min={0}
              max={1}
              step={0.01}
              value={config.TWINKLE_MAX_INTENSITY}
              onChange={(value) => void patch({ TWINKLE_MAX_INTENSITY: value })}
            />
            <RangeField
              label="Randomness"
              hint="Offsets bulb phases so the string feels less mechanical."
              min={0}
              max={1}
              step={0.01}
              value={config.TWINKLE_RANDOMNESS}
              onChange={(value) => void patch({ TWINKLE_RANDOMNESS: value })}
            />
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard
            title="Sway"
            description="A lighter-weight follow-up to the old procedural sway system. Both axes can stay at zero if you only want the look-dev pass."
          >
            <RangeField
              label="Sway X"
              hint="Horizontal drift across the string."
              min={0}
              max={2}
              step={0.01}
              value={config.SWAY_X}
              onChange={(value) => void patch({ SWAY_X: value })}
            />
            <RangeField
              label="Sway Z"
              hint="Depth sway toward and away from the camera."
              min={0}
              max={2}
              step={0.01}
              value={config.SWAY_Z}
              onChange={(value) => void patch({ SWAY_Z: value })}
            />
          </PanelCard>
        </div>
      </PageGrid>
    </div>
  );
}
