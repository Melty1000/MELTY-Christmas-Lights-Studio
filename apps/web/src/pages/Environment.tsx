import {
  MetricGrid,
  PageGrid,
  PageIntro,
  PanelCard,
  RangeField,
  StatusPill,
  ToggleField,
} from '~/components/controls/ControlPrimitives.tsx';
import { useConfigStore } from '~/stores/useConfigStore.ts';

export function Environment() {
  const config = useConfigStore((state) => state.config);
  const patch = useConfigStore((state) => state.patch);

  return (
    <div className="space-y-6 p-6">
      <PageIntro
        title="Camera, atmosphere, and post FX"
        description="Everything here is about presentation rather than topology. These controls stay live while the overlay runs so it is easy to match the legacy framing and atmosphere."
        actions={<StatusPill label={config.BACKGROUND_ENABLED ? 'Backdrop on' : 'Transparent OBS'} tone={config.BACKGROUND_ENABLED ? 'accent' : 'neutral'} />}
      />

      <MetricGrid
        items={[
          {
            label: 'Camera Distance',
            value: config.CAMERA_DISTANCE.toFixed(1),
            detail: 'Primary zoom/framing control.',
          },
          {
            label: 'Ambient',
            value: config.AMBIENT_INTENSITY.toFixed(2),
            detail: 'Base scene light before bloom.',
          },
          {
            label: 'Snow + Stars',
            value: `${config.SNOW_ENABLED ? 'Snow' : 'No Snow'} | ${config.STARS_ENABLED ? 'Stars' : 'No Stars'}`,
            detail: 'Presentation layers for the styled background mode.',
          },
          {
            label: 'Bloom',
            value: config.POSTFX_ENABLED ? config.BLOOM_STRENGTH.toFixed(2) : 'Off',
            detail: 'Post stack stays live while framing the overlay.',
            tone: config.POSTFX_ENABLED ? 'accent' : 'neutral',
          },
        ]}
        columns={4}
      />

      <PageGrid>
        <div className="space-y-6">
          <PanelCard
            title="Camera and lighting"
            description="Use these to land the same composition you were dialing in before the rewrite."
          >
            <RangeField
              label="Camera distance"
              hint="Moves the lens closer or farther from the string."
              min={1}
              max={200}
              step={0.1}
              value={config.CAMERA_DISTANCE}
              onChange={(value) => void patch({ CAMERA_DISTANCE: value })}
            />
            <RangeField
              label="Camera height"
              hint="Vertical framing offset."
              min={-50}
              max={50}
              step={0.1}
              value={config.CAMERA_HEIGHT}
              onChange={(value) => void patch({ CAMERA_HEIGHT: value })}
            />
            <RangeField
              label="Camera pan"
              hint="Horizontal framing offset."
              min={-50}
              max={50}
              step={0.1}
              value={config.CAMERA_X}
              onChange={(value) => void patch({ CAMERA_X: value })}
            />
            <RangeField
              label="Ambient intensity"
              hint="Base lighting before bloom or point lights."
              min={0}
              max={5}
              step={0.01}
              value={config.AMBIENT_INTENSITY}
              onChange={(value) => void patch({ AMBIENT_INTENSITY: value })}
            />
            <ToggleField
              label="Point lights"
              hint="Optional extra glow sources for the heavier 3D path."
              checked={config.POINT_LIGHTS_ENABLED}
              onChange={(value) => void patch({ POINT_LIGHTS_ENABLED: value })}
            />
          </PanelCard>

          <PanelCard
            title="Backdrop and bloom"
            description="Useful when you want a presentation-ready scene instead of a transparent overlay."
          >
            <ToggleField
              label="Background"
              hint="Switch between transparent OBS output and a styled backdrop."
              checked={config.BACKGROUND_ENABLED}
              onChange={(value) => void patch({ BACKGROUND_ENABLED: value })}
            />
            <ToggleField
              label="Post FX"
              hint="Master toggle for bloom."
              checked={config.POSTFX_ENABLED}
              onChange={(value) => void patch({ POSTFX_ENABLED: value })}
            />
            <RangeField
              label="Bloom strength"
              hint="Overall bloom contribution."
              min={0}
              max={5}
              step={0.01}
              value={config.BLOOM_STRENGTH}
              onChange={(value) => void patch({ BLOOM_STRENGTH: value })}
            />
            <RangeField
              label="Bloom radius"
              hint="How far the bloom spreads."
              min={0}
              max={2}
              step={0.01}
              value={config.BLOOM_RADIUS}
              onChange={(value) => void patch({ BLOOM_RADIUS: value })}
            />
            <RangeField
              label="Bloom threshold"
              hint="Minimum brightness that starts glowing."
              min={0}
              max={1}
              step={0.01}
              value={config.BLOOM_THRESHOLD}
              onChange={(value) => void patch({ BLOOM_THRESHOLD: value })}
            />
            <RangeField
              label="Bloom intensity"
              hint="Secondary bloom multiplier kept for parity with the legacy controls."
              min={0}
              max={5}
              step={0.01}
              value={config.BLOOM_INTENSITY}
              onChange={(value) => void patch({ BLOOM_INTENSITY: value })}
            />
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard
            title="Snow field"
            description="Soft atmosphere for presentation mode. Leave disabled for a clean transparent overlay."
          >
            <ToggleField
              label="Snow"
              hint="Enable drifting snow particles."
              checked={config.SNOW_ENABLED}
              onChange={(value) => void patch({ SNOW_ENABLED: value })}
            />
            <RangeField
              label="Snow count"
              hint="Total number of particles in the field."
              min={0}
              max={2000}
              step={1}
              value={config.SNOW_COUNT}
              onChange={(value) => void patch({ SNOW_COUNT: Math.round(value) })}
            />
            <RangeField
              label="Snow speed"
              hint="Downward fall speed."
              min={0}
              max={0.1}
              step={0.001}
              value={config.SNOW_SPEED}
              onChange={(value) => void patch({ SNOW_SPEED: value })}
            />
            <RangeField
              label="Snow size"
              hint="Average particle size."
              min={0}
              max={0.5}
              step={0.001}
              value={config.SNOW_SIZE}
              onChange={(value) => void patch({ SNOW_SIZE: value })}
            />
            <RangeField
              label="Snow drift"
              hint="Horizontal wind push."
              min={-1}
              max={1}
              step={0.01}
              value={config.SNOW_DRIFT}
              onChange={(value) => void patch({ SNOW_DRIFT: value })}
            />
          </PanelCard>

          <PanelCard
            title="Stars and diagnostics"
            description="Starfield polish for the styled-background mode, plus a few runtime toggles that help during look-dev."
          >
            <ToggleField
              label="Stars"
              hint="Enable the star layer."
              checked={config.STARS_ENABLED}
              onChange={(value) => void patch({ STARS_ENABLED: value })}
            />
            <RangeField
              label="Star count"
              hint="Total stars in the field."
              min={0}
              max={2000}
              step={1}
              value={config.STARS_COUNT}
              onChange={(value) => void patch({ STARS_COUNT: Math.round(value) })}
            />
            <RangeField
              label="Star size"
              hint="Per-star radius factor."
              min={0}
              max={1}
              step={0.01}
              value={config.STARS_SIZE}
              onChange={(value) => void patch({ STARS_SIZE: value })}
            />
            <RangeField
              label="Star opacity"
              hint="Overall star layer visibility."
              min={0}
              max={1}
              step={0.01}
              value={config.STARS_OPACITY}
              onChange={(value) => void patch({ STARS_OPACITY: value })}
            />
            <RangeField
              label="Star twinkle speed"
              hint="Light modulation for the star layer."
              min={0}
              max={5}
              step={0.01}
              value={config.STARS_TWINKLE_SPEED}
              onChange={(value) => void patch({ STARS_TWINKLE_SPEED: value })}
            />
            <ToggleField
              label="Antialiasing"
              hint="Stored in config for parity; a reload may be needed to fully reinitialize the canvas."
              checked={config.ANTIALIAS_ENABLED}
              onChange={(value) => void patch({ ANTIALIAS_ENABLED: value })}
            />
            <ToggleField
              label="Stats panel"
              hint="Development helper for performance checks."
              checked={config.STATS_ENABLED}
              onChange={(value) => void patch({ STATS_ENABLED: value })}
            />
          </PanelCard>
        </div>
      </PageGrid>
    </div>
  );
}
