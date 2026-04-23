import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ANIMATION_STYLES,
  SOCKET_THEME_NAMES,
  THEME_NAMES,
  THEMES,
  WIRE_THEME_NAMES,
  type Preset,
} from '@melty/shared';
import {
  ActionButton,
  CodeBlock,
  CollapsibleSection,
  ColorStrip,
  EmptyState,
  MessageBanner,
  PageRoot,
  RangeField,
  SectionColumns,
  SelectField,
  StatusPill,
  SubGroup,
  TextField,
  ToggleField,
} from '~/components/controls/ControlPrimitives.tsx';
import { formatToken } from '~/lib/format.ts';
import {
  applyPreset,
  buildPreset,
  exportPresetFile,
  fetchPresets,
  importPresetFile,
  removePreset,
  savePreset,
  slugifyPresetId,
} from '~/lib/presets.ts';
import { useConfigStore } from '~/stores/useConfigStore.ts';

export function Studio() {
  const config = useConfigStore((state) => state.config);
  const patch = useConfigStore((state) => state.patch);
  const activeTheme = THEMES[config.ACTIVE_THEME];

  return (
    <PageRoot>
      {/* ------------------------------------------------------------ */}
      {/* THEME & COLORS                                                */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection
        id="theme"
        title="Theme & Colors"
        hint={`${activeTheme.bulbs.length} bulb colors`}
        defaultOpen
        action={<StatusPill label={formatToken(config.ACTIVE_THEME)} tone="accent" />}
      >
        <SelectField
          label="Bulb theme"
          value={config.ACTIVE_THEME}
          options={THEME_NAMES.map((name) => ({ label: formatToken(name), value: name }))}
          onChange={(value) =>
            void patch({ ACTIVE_THEME: value as (typeof THEME_NAMES)[number] })
          }
        />
        <SelectField
          label="Socket theme"
          value={config.SOCKET_THEME}
          options={SOCKET_THEME_NAMES.map((name) => ({
            label: formatToken(name),
            value: name,
          }))}
          onChange={(value) =>
            void patch({ SOCKET_THEME: value as (typeof SOCKET_THEME_NAMES)[number] })
          }
        />
        <SelectField
          label="Wire theme"
          value={config.WIRE_THEME}
          options={WIRE_THEME_NAMES.map((name) => ({
            label: formatToken(name),
            value: name,
          }))}
          onChange={(value) =>
            void patch({ WIRE_THEME: value as (typeof WIRE_THEME_NAMES)[number] })
          }
        />
        <ColorStrip colors={activeTheme.bulbs} />
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* BULBS                                                         */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection id="bulbs" title="Bulbs" defaultOpen>
        <SectionColumns columns={2}>
          <SubGroup title="Geometry">
            <RangeField
              label="Bulb scale"
              min={0.1}
              max={3}
              step={0.01}
              value={config.BULB_SCALE}
              onChange={(value) => void patch({ BULB_SCALE: value })}
            />
          </SubGroup>
          <SubGroup title="Glass">
            <RangeField
              label="Opacity"
              min={0}
              max={1}
              step={0.01}
              value={config.GLASS_OPACITY}
              onChange={(value) => void patch({ GLASS_OPACITY: value })}
            />
            <RangeField
              label="Roughness"
              min={0}
              max={1}
              step={0.01}
              value={config.GLASS_ROUGHNESS}
              onChange={(value) => void patch({ GLASS_ROUGHNESS: value })}
            />
            <RangeField
              label="IOR"
              min={1}
              max={3}
              step={0.01}
              value={config.GLASS_IOR}
              onChange={(value) => void patch({ GLASS_IOR: value })}
            />
          </SubGroup>
        </SectionColumns>
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* WIRES                                                         */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection
        id="wires"
        title="Wires"
        hint={`${config.NUM_PINS - 1} spans`}
      >
        <SectionColumns columns={2}>
          <SubGroup title="Geometry">
            <RangeField
              label="Pin points"
              min={2}
              max={20}
              step={1}
              value={config.NUM_PINS}
              onChange={(value) => void patch({ NUM_PINS: Math.round(value) })}
            />
            <RangeField
              label="Lights / span"
              min={1}
              max={100}
              step={1}
              value={config.LIGHTS_PER_SEGMENT}
              onChange={(value) => void patch({ LIGHTS_PER_SEGMENT: Math.round(value) })}
            />
            <RangeField
              label="Sag"
              min={0}
              max={2}
              step={0.01}
              value={config.SAG_AMPLITUDE}
              onChange={(value) => void patch({ SAG_AMPLITUDE: value })}
            />
            <RangeField
              label="Tension"
              min={-1}
              max={1}
              step={0.01}
              value={config.TENSION}
              onChange={(value) => void patch({ TENSION: value })}
            />
          </SubGroup>
          <SubGroup title="Appearance">
            <RangeField
              label="Thickness"
              min={0}
              max={0.2}
              step={0.001}
              value={config.WIRE_THICKNESS}
              onChange={(value) => void patch({ WIRE_THICKNESS: value })}
            />
            <RangeField
              label="Separation"
              min={0}
              max={0.3}
              step={0.001}
              value={config.WIRE_SEPARATION}
              onChange={(value) => void patch({ WIRE_SEPARATION: value })}
            />
            <RangeField
              label="Offset"
              min={0}
              max={1}
              step={0.001}
              value={config.WIRE_OFFSET}
              onChange={(value) => void patch({ WIRE_OFFSET: value })}
            />
            <RangeField
              label="Twists"
              min={0}
              max={1000}
              step={1}
              value={config.WIRE_TWISTS}
              onChange={(value) => void patch({ WIRE_TWISTS: Math.round(value) })}
            />
          </SubGroup>
        </SectionColumns>
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* MOTION & EFFECTS                                              */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection id="motion" title="Motion & Effects">
        <SectionColumns columns={2}>
          <SubGroup title="Animation">
            <SelectField
              label="Style"
              value={config.ANIMATION_STYLE}
              options={ANIMATION_STYLES.map((name) => ({
                label: formatToken(name),
                value: name,
              }))}
              onChange={(value) =>
                void patch({ ANIMATION_STYLE: value as (typeof ANIMATION_STYLES)[number] })
              }
            />
            <RangeField
              label="Speed"
              min={0}
              max={5}
              step={0.01}
              value={config.ANIMATION_SPEED}
              onChange={(value) => void patch({ ANIMATION_SPEED: value })}
            />
            <RangeField
              label="Sway X"
              min={0}
              max={2}
              step={0.01}
              value={config.SWAY_X}
              onChange={(value) => void patch({ SWAY_X: value })}
            />
            <RangeField
              label="Sway Z"
              min={0}
              max={2}
              step={0.01}
              value={config.SWAY_Z}
              onChange={(value) => void patch({ SWAY_Z: value })}
            />
          </SubGroup>
          <SubGroup title="Twinkle">
            <RangeField
              label="Speed"
              min={0}
              max={4}
              step={0.01}
              value={config.TWINKLE_SPEED}
              onChange={(value) => void patch({ TWINKLE_SPEED: value })}
            />
            <RangeField
              label="Min intensity"
              min={0}
              max={1}
              step={0.01}
              value={config.TWINKLE_MIN_INTENSITY}
              onChange={(value) => void patch({ TWINKLE_MIN_INTENSITY: value })}
            />
            <RangeField
              label="Max intensity"
              min={0}
              max={1}
              step={0.01}
              value={config.TWINKLE_MAX_INTENSITY}
              onChange={(value) => void patch({ TWINKLE_MAX_INTENSITY: value })}
            />
            <RangeField
              label="Randomness"
              min={0}
              max={1}
              step={0.01}
              value={config.TWINKLE_RANDOMNESS}
              onChange={(value) => void patch({ TWINKLE_RANDOMNESS: value })}
            />
          </SubGroup>
        </SectionColumns>
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* CAMERA                                                        */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection id="camera" title="Camera">
        <RangeField
          label="Distance"
          min={1}
          max={200}
          step={0.1}
          value={config.CAMERA_DISTANCE}
          onChange={(value) => void patch({ CAMERA_DISTANCE: value })}
        />
        <RangeField
          label="Height (Y)"
          min={-50}
          max={50}
          step={0.1}
          value={config.CAMERA_HEIGHT}
          onChange={(value) => void patch({ CAMERA_HEIGHT: value })}
        />
        <RangeField
          label="Pan (X)"
          min={-50}
          max={50}
          step={0.1}
          value={config.CAMERA_X}
          onChange={(value) => void patch({ CAMERA_X: value })}
        />
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* LIGHTING                                                      */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection id="lighting" title="Scene Lighting">
        <RangeField
          label="Ambient"
          min={0}
          max={5}
          step={0.01}
          value={config.AMBIENT_INTENSITY}
          onChange={(value) => void patch({ AMBIENT_INTENSITY: value })}
        />
        <RangeField
          label="Key light"
          min={0}
          max={5}
          step={0.01}
          value={config.KEY_LIGHT_INTENSITY}
          onChange={(value) => void patch({ KEY_LIGHT_INTENSITY: value })}
        />
        <RangeField
          label="Fill light"
          min={0}
          max={5}
          step={0.01}
          value={config.FILL_LIGHT_INTENSITY}
          onChange={(value) => void patch({ FILL_LIGHT_INTENSITY: value })}
        />
        <RangeField
          label="Hemisphere"
          min={0}
          max={5}
          step={0.01}
          value={config.HEMI_LIGHT_INTENSITY}
          onChange={(value) => void patch({ HEMI_LIGHT_INTENSITY: value })}
        />
        <ToggleField
          label="Reflections"
          checked={config.POINT_LIGHTS_ENABLED}
          onChange={(value) => void patch({ POINT_LIGHTS_ENABLED: value })}
        />
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* POST FX                                                       */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection id="postfx" title="Post FX / Bloom">
        <ToggleField
          label="Post FX"
          checked={config.POSTFX_ENABLED}
          onChange={(value) => void patch({ POSTFX_ENABLED: value })}
        />
        <RangeField
          label="Strength"
          min={0}
          max={5}
          step={0.01}
          value={config.BLOOM_STRENGTH}
          onChange={(value) => void patch({ BLOOM_STRENGTH: value })}
        />
        <RangeField
          label="Radius"
          min={0}
          max={2}
          step={0.01}
          value={config.BLOOM_RADIUS}
          onChange={(value) => void patch({ BLOOM_RADIUS: value })}
        />
        <RangeField
          label="Threshold"
          min={0}
          max={1}
          step={0.01}
          value={config.BLOOM_THRESHOLD}
          onChange={(value) => void patch({ BLOOM_THRESHOLD: value })}
        />
        <RangeField
          label="Intensity"
          min={0}
          max={5}
          step={0.01}
          value={config.BLOOM_INTENSITY}
          onChange={(value) => void patch({ BLOOM_INTENSITY: value })}
        />
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* ENVIRONMENT                                                   */}
      {/* ------------------------------------------------------------ */}
      <CollapsibleSection id="environment" title="Environment">
        <SectionColumns columns={2}>
          <SubGroup title="Backdrop">
            <ToggleField
              label="Solid background"
              checked={config.BACKGROUND_ENABLED}
              onChange={(value) => void patch({ BACKGROUND_ENABLED: value })}
            />
            <ToggleField
              label="Antialiasing"
              checked={config.ANTIALIAS_ENABLED}
              onChange={(value) => void patch({ ANTIALIAS_ENABLED: value })}
            />
            <ToggleField
              label="Stats panel"
              checked={config.STATS_ENABLED}
              onChange={(value) => void patch({ STATS_ENABLED: value })}
            />
          </SubGroup>
          <SubGroup title="Snow">
            <ToggleField
              label="Enable snow"
              checked={config.SNOW_ENABLED}
              onChange={(value) => void patch({ SNOW_ENABLED: value })}
            />
            <RangeField
              label="Count"
              min={0}
              max={2000}
              step={1}
              value={config.SNOW_COUNT}
              onChange={(value) => void patch({ SNOW_COUNT: Math.round(value) })}
            />
            <RangeField
              label="Speed"
              min={0}
              max={0.1}
              step={0.001}
              value={config.SNOW_SPEED}
              onChange={(value) => void patch({ SNOW_SPEED: value })}
            />
            <RangeField
              label="Size"
              min={0}
              max={0.5}
              step={0.001}
              value={config.SNOW_SIZE}
              onChange={(value) => void patch({ SNOW_SIZE: value })}
            />
            <RangeField
              label="Drift"
              min={-1}
              max={1}
              step={0.01}
              value={config.SNOW_DRIFT}
              onChange={(value) => void patch({ SNOW_DRIFT: value })}
            />
          </SubGroup>
          <SubGroup title="Stars">
            <ToggleField
              label="Enable stars"
              checked={config.STARS_ENABLED}
              onChange={(value) => void patch({ STARS_ENABLED: value })}
            />
            <RangeField
              label="Count"
              min={0}
              max={2000}
              step={1}
              value={config.STARS_COUNT}
              onChange={(value) => void patch({ STARS_COUNT: Math.round(value) })}
            />
            <RangeField
              label="Size"
              min={0}
              max={1}
              step={0.01}
              value={config.STARS_SIZE}
              onChange={(value) => void patch({ STARS_SIZE: value })}
            />
            <RangeField
              label="Opacity"
              min={0}
              max={1}
              step={0.01}
              value={config.STARS_OPACITY}
              onChange={(value) => void patch({ STARS_OPACITY: value })}
            />
            <RangeField
              label="Twinkle speed"
              min={0}
              max={5}
              step={0.01}
              value={config.STARS_TWINKLE_SPEED}
              onChange={(value) => void patch({ STARS_TWINKLE_SPEED: value })}
            />
          </SubGroup>
        </SectionColumns>
      </CollapsibleSection>

      {/* ------------------------------------------------------------ */}
      {/* PRESETS                                                       */}
      {/* ------------------------------------------------------------ */}
      <PresetsCollapsible />
    </PageRoot>
  );
}

// ---------------------------------------------------------------------------
// Presets — embedded inline so the whole studio lives in one page
// ---------------------------------------------------------------------------

function PresetsCollapsible() {
  const config = useConfigStore((state) => state.config);
  const hydrate = useConfigStore((state) => state.hydrate);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [draftName, setDraftName] = useState('Stage Look');
  const [draftId, setDraftId] = useState('stage-look');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedId) ?? null,
    [presets, selectedId],
  );

  async function refreshPresets() {
    setLoading(true);
    try {
      const next = await fetchPresets();
      setPresets(next);
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshPresets();
  }, []);

  function loadIntoEditor(preset: Preset) {
    setSelectedId(preset.id);
    setDraftName(preset.name);
    setDraftId(preset.id);
  }

  function clearEditor() {
    setSelectedId(null);
    setDraftName('Stage Look');
    setDraftId('stage-look');
    setMessage(null);
  }

  async function handleSave() {
    const normalizedName = draftName.trim();
    const normalizedId = slugifyPresetId(draftId || draftName);
    if (!normalizedName || !normalizedId) {
      setMessage('Preset name and id are required.');
      return;
    }
    setBusy(true);
    try {
      const preset = buildPreset(normalizedName, normalizedId, config);
      await savePreset(preset);
      await refreshPresets();
      setSelectedId(normalizedId);
      setDraftId(normalizedId);
      setMessage(`Saved preset "${normalizedName}".`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleApply(id: string) {
    setBusy(true);
    try {
      await applyPreset(id);
      await hydrate();
      setMessage(`Applied preset "${id}".`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await removePreset(id);
      await refreshPresets();
      if (selectedId === id) clearEditor();
      setMessage(`Deleted preset "${id}".`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File) {
    setBusy(true);
    try {
      const preset = await importPresetFile(file);
      await savePreset(preset);
      await refreshPresets();
      loadIntoEditor(preset);
      setMessage(`Imported preset "${preset.name}".`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const currentScenePreset = buildPreset(
    draftName.trim() || 'Current Look',
    slugifyPresetId(draftId || draftName || 'current-look'),
    config,
  );

  return (
    <CollapsibleSection
      id="presets"
      title="Presets"
      hint={`${presets.length} saved`}
      action={loading ? <StatusPill label="Loading" tone="warn" /> : null}
    >
      <SectionColumns columns={2}>
        <SubGroup title="Save Current Look">
          <TextField
            label="Name"
            value={draftName}
            onChange={(value) => {
              setDraftName(value);
              if (!selectedId) setDraftId(slugifyPresetId(value));
            }}
          />
          <TextField
            label="ID"
            value={draftId}
            onChange={(value) => setDraftId(slugifyPresetId(value))}
          />
          <div className="flex flex-wrap gap-2 px-1.5 py-1">
            <ActionButton onClick={() => void handleSave()} disabled={busy}>
              {selectedPreset && selectedPreset.id === draftId ? 'Update' : 'Save'}
            </ActionButton>
            <ActionButton
              tone="secondary"
              onClick={() => exportPresetFile(currentScenePreset)}
            >
              Export JSON
            </ActionButton>
            <ActionButton
              tone="secondary"
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
            >
              Import JSON
            </ActionButton>
            <ActionButton tone="secondary" onClick={() => void refreshPresets()} disabled={busy}>
              Refresh
            </ActionButton>
            <ActionButton tone="secondary" onClick={clearEditor}>
              Clear
            </ActionButton>
          </div>
          <CodeBlock label="Snapshot id" value={currentScenePreset.id} />
          {message ? <MessageBanner>{message}</MessageBanner> : null}
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleImport(file);
              event.currentTarget.value = '';
            }}
          />
        </SubGroup>

        <SubGroup title="Library">
          <div className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1">
            {presets.length === 0 && !loading ? (
              <EmptyState>
                No presets saved yet. Save the current look or import JSON to get started.
              </EmptyState>
            ) : null}
            {presets.map((preset) => (
              <article
                key={preset.id}
                className={`rounded-lg border px-3 py-2.5 transition-colors ${
                  selectedId === preset.id
                    ? 'border-melt-accent/40 bg-melt-accent/10'
                    : 'border-melt-text-muted/10 bg-melt-surface/20 hover:border-melt-accent/25'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => loadIntoEditor(preset)}
                    className="text-left"
                  >
                    <div className="text-[12px] font-black tracking-[0.08em] uppercase text-melt-text-heading">
                      {preset.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-melt-text-muted">
                      {preset.id}
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-1">
                    {preset.builtIn ? (
                      <StatusPill label="Built in" tone="neutral" />
                    ) : (
                      <StatusPill label="Custom" tone="accent" />
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ActionButton
                    tone="secondary"
                    onClick={() => void handleApply(preset.id)}
                    disabled={busy}
                  >
                    Apply
                  </ActionButton>
                  <ActionButton tone="secondary" onClick={() => exportPresetFile(preset)}>
                    Export
                  </ActionButton>
                  {!preset.builtIn ? (
                    <ActionButton
                      tone="danger"
                      onClick={() => void handleDelete(preset.id)}
                      disabled={busy}
                    >
                      Delete
                    </ActionButton>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </SubGroup>
      </SectionColumns>
    </CollapsibleSection>
  );
}
