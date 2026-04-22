import {
  SOCKET_THEME_NAMES,
  THEME_NAMES,
  THEMES,
} from '@melty/shared';
import {
  ColorStrip,
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

export function Bulbs() {
  const config = useConfigStore((state) => state.config);
  const patch = useConfigStore((state) => state.patch);
  const activeTheme = THEMES[config.ACTIVE_THEME];

  return (
    <div className="space-y-6 p-6">
      <PageIntro
        title="Bulb palette and glass tuning"
        description="This is the main personality pass for the overlay. Theme, socket finish, bulb scale, and glass/emissive values all feed straight into the live scene through the shared config store."
        actions={<StatusPill label={`${activeTheme.bulbs.length} live colors`} tone="accent" />}
      />

      <MetricGrid
        items={[
          {
            label: 'Theme',
            value: formatToken(config.ACTIVE_THEME),
            detail: 'Primary palette driving the billboard baseline.',
            tone: 'accent',
          },
          {
            label: 'Socket Finish',
            value: formatToken(config.SOCKET_THEME),
            detail: 'Caps and sockets stay tied to the shared config.',
          },
          {
            label: 'Bulb Scale',
            value: `${config.BULB_SCALE.toFixed(2)}x`,
            detail: 'Silhouette size against the wire hang.',
          },
          {
            label: 'Emissive',
            value: config.EMISSIVE_INTENSITY.toFixed(2),
            detail: 'Base glow before bloom and post FX.',
          },
        ]}
        columns={4}
      />

      <PageGrid>
        <div className="space-y-6">
          <PanelCard
            title="Theme direction"
            description="Swap the bulb palette and socket finish without rebuilding the scene. Billboard mode should feel right here before we touch advanced quality tiers again."
          >
            <SelectField
              label="Active theme"
              hint="Color order is reused by the animation system for fades and party modes."
              value={config.ACTIVE_THEME}
              options={THEME_NAMES.map((name) => ({ label: formatToken(name), value: name }))}
              onChange={(value) => void patch({ ACTIVE_THEME: value as (typeof THEME_NAMES)[number] })}
            />
            <SelectField
              label="Socket theme"
              hint="Wire Match keeps sockets tied to each side of the twisted pair."
              value={config.SOCKET_THEME}
              options={SOCKET_THEME_NAMES.map((name) => ({ label: formatToken(name), value: name }))}
              onChange={(value) => void patch({ SOCKET_THEME: value as (typeof SOCKET_THEME_NAMES)[number] })}
            />
          </PanelCard>

          <PanelCard
            title="Bulb body"
            description="Scale and light output should hold up in the billboard pass before we worry about restoring the heavier 3D tiers."
          >
            <RangeField
              label="Bulb scale"
              hint="Controls silhouette size and wire-to-bulb balance."
              min={0.1}
              max={3}
              step={0.01}
              value={config.BULB_SCALE}
              onChange={(value) => void patch({ BULB_SCALE: value })}
            />
            <RangeField
              label="Emissive intensity"
              hint="How hard the bulb glows before bloom gets added."
              min={0}
              max={20}
              step={0.05}
              value={config.EMISSIVE_INTENSITY}
              onChange={(value) => void patch({ EMISSIVE_INTENSITY: value })}
            />
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard
            title="Live palette"
            description="A quick read on how the active theme is distributed. This mirrors the exact palette the scene uses."
          >
            <ColorStrip colors={activeTheme.bulbs} />
          </PanelCard>

          <PanelCard
            title="Glass response"
            description="These values shape the bulb shell for both the 3D fallback and the billboard look-dev pass."
          >
            <RangeField
              label="Glass opacity"
              hint="Lower values lean ghostly; higher values feel more plastic and solid."
              min={0}
              max={1}
              step={0.01}
              value={config.GLASS_OPACITY}
              onChange={(value) => void patch({ GLASS_OPACITY: value })}
            />
            <RangeField
              label="Glass roughness"
              hint="Dial up for softer reflections and a milkier shell."
              min={0}
              max={1}
              step={0.01}
              value={config.GLASS_ROUGHNESS}
              onChange={(value) => void patch({ GLASS_ROUGHNESS: value })}
            />
            <RangeField
              label="Glass IOR"
              hint="Kept in the shared config for the higher-fidelity path and visual consistency."
              min={1}
              max={3}
              step={0.01}
              value={config.GLASS_IOR}
              onChange={(value) => void patch({ GLASS_IOR: value })}
            />
          </PanelCard>
        </div>
      </PageGrid>
    </div>
  );
}
