import { WIRE_THEME_NAMES } from '@melty/shared';
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

export function Wires() {
  const config = useConfigStore((state) => state.config);
  const patch = useConfigStore((state) => state.patch);

  return (
    <div className="space-y-6 p-6">
      <PageIntro
        title="String profile and wire spacing"
        description="This page controls the catenary shape that the billboard pass has to nail. Sag, tension, separation, and twist count are the big silhouette drivers."
        actions={<StatusPill label={`${config.NUM_PINS - 1} spans`} tone="accent" />}
      />

      <MetricGrid
        items={[
          {
            label: 'Pins',
            value: config.NUM_PINS,
            detail: 'Total anchor points across the run.',
          },
          {
            label: 'Lights / Span',
            value: config.LIGHTS_PER_SEGMENT,
            detail: 'Density between every pair of pins.',
          },
          {
            label: 'Sag',
            value: config.SAG_AMPLITUDE.toFixed(2),
            detail: 'Vertical dip shaping the legacy look.',
            tone: 'accent',
          },
          {
            label: 'Twists',
            value: config.WIRE_TWISTS,
            detail: 'Overall twist cadence across the pair.',
          },
        ]}
        columns={4}
      />

      <PageGrid>
        <div className="space-y-6">
          <PanelCard
            title="Structure"
            description="These values control the size and density of the light string before any animation or post-processing happens."
          >
            <RangeField
              label="Pins"
              hint="Number of anchor points across the full string."
              min={2}
              max={20}
              step={1}
              value={config.NUM_PINS}
              onChange={(value) => void patch({ NUM_PINS: Math.round(value) })}
            />
            <RangeField
              label="Lights per span"
              hint="Density between each pair of pins."
              min={1}
              max={100}
              step={1}
              value={config.LIGHTS_PER_SEGMENT}
              onChange={(value) => void patch({ LIGHTS_PER_SEGMENT: Math.round(value) })}
            />
            <SelectField
              label="Wire theme"
              hint="Each twisted side keeps its own metal color pair."
              value={config.WIRE_THEME}
              options={WIRE_THEME_NAMES.map((name) => ({ label: formatToken(name), value: name }))}
              onChange={(value) => void patch({ WIRE_THEME: value as (typeof WIRE_THEME_NAMES)[number] })}
            />
          </PanelCard>

          <PanelCard
            title="Hang and framing"
            description="The billboard-first milestone depends on these feeling like the legacy scene at a glance."
          >
            <RangeField
              label="Sag amplitude"
              hint="How deep each span sags between pins."
              min={0}
              max={2}
              step={0.01}
              value={config.SAG_AMPLITUDE}
              onChange={(value) => void patch({ SAG_AMPLITUDE: value })}
            />
            <RangeField
              label="Tension"
              hint="Blends between a softer parabola and a tighter catenary profile."
              min={-1}
              max={1}
              step={0.01}
              value={config.TENSION}
              onChange={(value) => void patch({ TENSION: value })}
            />
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard
            title="Wire pair geometry"
            description="Fine tuning for thickness and twist. Billboard remains the preferred visible mode, but these values stay compatible with the heavier tiers."
          >
            <RangeField
              label="Wire thickness"
              hint="Tube radius for both wire strands."
              min={0}
              max={0.2}
              step={0.001}
              value={config.WIRE_THICKNESS}
              onChange={(value) => void patch({ WIRE_THICKNESS: value })}
            />
            <RangeField
              label="Wire offset"
              hint="Reserved for attachment shaping and legacy parity tweaks."
              min={0}
              max={1}
              step={0.001}
              value={config.WIRE_OFFSET}
              onChange={(value) => void patch({ WIRE_OFFSET: value })}
            />
            <RangeField
              label="Wire separation"
              hint="Distance between the two twisted strands."
              min={0}
              max={0.3}
              step={0.001}
              value={config.WIRE_SEPARATION}
              onChange={(value) => void patch({ WIRE_SEPARATION: value })}
            />
            <RangeField
              label="Wire twists"
              hint="Overall twist frequency across the full string."
              min={0}
              max={1000}
              step={1}
              value={config.WIRE_TWISTS}
              onChange={(value) => void patch({ WIRE_TWISTS: Math.round(value) })}
            />
          </PanelCard>
        </div>
      </PageGrid>
    </div>
  );
}
