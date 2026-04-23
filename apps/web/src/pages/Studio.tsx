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
  StatusPill,
  TextField,
} from '~/components/controls/ControlPrimitives.tsx';
import {
  BoundRange,
  BoundSelect,
  BoundToggle,
} from '~/components/controls/BoundFields.tsx';
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

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------
//
// IMPORTANT: Studio itself subscribes to the MINIMUM needed from the config
// store. Each `Bound*` field subscribes to its own key, so dragging any
// slider re-renders only that slider — not the entire control panel. That
// eliminates the 100-field walk on every pixel of drag that was causing
// the lag.
//
// Layout: one flat column. The user explicitly asked for a single column
// and for the dual-column + card-style grouping to go away, so the whole
// page is just a sequence of collapsible sections with stacked fields.
// ---------------------------------------------------------------------------

const THEME_OPTIONS = THEME_NAMES.map((name) => ({
  label: formatToken(name),
  value: name,
}));
const SOCKET_OPTIONS = SOCKET_THEME_NAMES.map((name) => ({
  label: formatToken(name),
  value: name,
}));
const WIRE_OPTIONS = WIRE_THEME_NAMES.map((name) => ({
  label: formatToken(name),
  value: name,
}));
const ANIMATION_OPTIONS = ANIMATION_STYLES.map((name) => ({
  label: formatToken(name),
  value: name,
}));

export function Studio() {
  return (
    <PageRoot>
      <ThemeSection />

      <CollapsibleSection id="bulbs" title="Bulbs" defaultOpen>
        <BoundRange field="BULB_SCALE" label="Bulb scale" min={0.1} max={1} step={0.01} />
        <BoundRange field="GLASS_OPACITY" label="Glass opacity" min={0} max={0.9} step={0.01} />
        <BoundRange field="GLASS_ROUGHNESS" label="Glass roughness" min={0} max={1} step={0.01} />
      </CollapsibleSection>

      <WiresSection />

      <CollapsibleSection id="motion" title="Motion">
        <BoundRange field="ANIMATION_SPEED" label="Animation speed" min={0} max={5} step={0.01} />
        <BoundRange field="SWAY_X" label="Sway X" min={0} max={2} step={0.01} />
        <BoundRange field="SWAY_Z" label="Sway Z" min={0} max={2} step={0.01} />
      </CollapsibleSection>

      <CollapsibleSection id="twinkle" title="Twinkle">
        <BoundSelect field="ANIMATION_STYLE" label="Style" options={ANIMATION_OPTIONS} />
        <BoundRange field="TWINKLE_SPEED" label="Twinkle speed" min={0} max={4} step={0.01} />
        <BoundRange field="TWINKLE_MIN_INTENSITY" label="Min intensity" min={0} max={1} step={0.01} />
        <BoundRange field="TWINKLE_MAX_INTENSITY" label="Max intensity" min={0} max={1} step={0.01} />
        <BoundRange field="TWINKLE_RANDOMNESS" label="Randomness" min={0} max={1} step={0.01} />
      </CollapsibleSection>

      <CollapsibleSection
        id="camera"
        title="Camera"
        hint="Distance dollies along the view (zoom). X/Y move the look-at on the string."
      >
        <BoundRange field="CAMERA_DISTANCE" label="Distance" min={1} max={200} step={0.1} />
        <BoundRange field="CAMERA_HEIGHT" label="Target offset (Y)" min={-50} max={50} step={0.1} />
        <BoundRange field="CAMERA_X" label="Target offset (X)" min={-50} max={50} step={0.1} />
      </CollapsibleSection>

      <CollapsibleSection
        id="lighting"
        title="Scene lighting"
        hint="Ambient: overall. Key / fill / hemi: wire contrast and read. Reflections: colored spill on the cord."
      >
        <BoundRange field="AMBIENT_INTENSITY" label="Ambient" min={0.15} max={5} step={0.01} />
        <BoundRange field="KEY_LIGHT_INTENSITY" label="Key light" min={0} max={5} step={0.01} />
        <BoundRange field="FILL_LIGHT_INTENSITY" label="Fill light" min={0} max={5} step={0.01} />
        <BoundRange field="HEMI_LIGHT_INTENSITY" label="Hemisphere" min={0} max={5} step={0.01} />
        <BoundToggle field="POINT_LIGHTS_ENABLED" label="Reflections" />
      </CollapsibleSection>

      <CollapsibleSection id="postfx" title="Post FX / Bloom">
        <BoundToggle field="POSTFX_ENABLED" label="Post FX" />
        <BoundRange field="BLOOM_STRENGTH" label="Strength" min={0} max={5} step={0.01} />
        <BoundRange field="BLOOM_RADIUS" label="Radius" min={0} max={2} step={0.01} />
        <BoundRange field="BLOOM_THRESHOLD" label="Threshold" min={0} max={1} step={0.01} />
        <BoundRange field="BLOOM_INTENSITY" label="Intensity" min={0} max={5} step={0.01} />
      </CollapsibleSection>

      <CollapsibleSection id="environment" title="Environment">
        <BoundToggle field="BACKGROUND_ENABLED" label="Solid background" />
        <BoundToggle field="ANTIALIAS_ENABLED" label="Antialiasing" />
        <BoundToggle field="STATS_ENABLED" label="Stats panel" />
      </CollapsibleSection>

      <CollapsibleSection id="snow" title="Snow">
        <BoundToggle field="SNOW_ENABLED" label="Enable snow" />
        <BoundRange field="SNOW_COUNT" label="Count" min={0} max={2000} step={1} round />
        <BoundRange field="SNOW_SPEED" label="Speed" min={0} max={0.1} step={0.001} />
        <BoundRange field="SNOW_SIZE" label="Size" min={0} max={0.5} step={0.001} />
        <BoundRange field="SNOW_DRIFT" label="Drift" min={-1} max={1} step={0.01} />
      </CollapsibleSection>

      <CollapsibleSection id="stars" title="Stars">
        <BoundToggle field="STARS_ENABLED" label="Enable stars" />
        <BoundRange field="STARS_COUNT" label="Count" min={0} max={2000} step={1} round />
        <BoundRange field="STARS_SIZE" label="Size" min={0} max={1} step={0.01} />
        <BoundRange field="STARS_OPACITY" label="Opacity" min={0} max={1} step={0.01} />
        <BoundRange field="STARS_TWINKLE_SPEED" label="Twinkle speed" min={0} max={5} step={0.01} />
      </CollapsibleSection>

      <PresetsCollapsible />
    </PageRoot>
  );
}

// Theme section is split out because it reads the live palette + label to
// feed the header hint and <ColorStrip>. Extracting it keeps the main
// Studio body free of a config subscription entirely.
function ThemeSection() {
  const activeThemeKey = useConfigStore((s) => s.config.ACTIVE_THEME);
  const activeTheme = THEMES[activeThemeKey];

  return (
    <CollapsibleSection
      id="theme"
      title="Theme & Colors"
      hint={`${activeTheme.bulbs.length} bulb colors`}
      defaultOpen
      action={<StatusPill label={formatToken(activeThemeKey)} tone="accent" />}
    >
      <BoundSelect field="ACTIVE_THEME" label="Bulb theme" options={THEME_OPTIONS} />
      <BoundSelect field="SOCKET_THEME" label="Socket theme" options={SOCKET_OPTIONS} />
      <BoundSelect field="WIRE_THEME" label="Wire theme" options={WIRE_OPTIONS} />
      <ColorStrip colors={activeTheme.bulbs} />
    </CollapsibleSection>
  );
}

// Wires header shows a live pin-count hint, so it subscribes to just that
// one number. Field re-renders are scoped to the header badge only.
function WiresSection() {
  const numPins = useConfigStore((s) => s.config.NUM_PINS);

  return (
    <CollapsibleSection id="wires" title="Wires" hint={`${Math.max(numPins - 1, 0)} spans`}>
      <BoundRange field="NUM_PINS" label="Pin points" min={2} max={20} step={1} round />
      <BoundRange field="LIGHTS_PER_SEGMENT" label="Lights / span" min={1} max={100} step={1} round />
      <BoundRange field="SAG_AMPLITUDE" label="Sag" min={0} max={2} step={0.01} />
      <BoundRange field="TENSION" label="Tension" min={-1} max={1} step={0.01} />
      <BoundRange field="WIRE_THICKNESS" label="Thickness" min={0} max={0.2} step={0.001} />
      <BoundRange field="WIRE_SEPARATION" label="Separation" min={0} max={0.3} step={0.001} />
      <BoundRange field="WIRE_TWISTS" label="Twists" min={0} max={1000} step={1} round />
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
// The list + form block used to do `const config = useConfigStore
// (s => s.config)` on the parent, which re-ran the entire preset list
// (and every `presets.map` card) on every slider tick. Save / export read
// `getState().config` at click time. The snapshot id is just the slug of
// the draft fields — it does not depend on live config, so we never
// subscribe to `config` here at all.
// ---------------------------------------------------------------------------

function PresetSnapshotId({ draftName, draftId }: { draftName: string; draftId: string }) {
  const snapshotId = useMemo(
    () => slugifyPresetId(draftId || draftName || 'current-look'),
    [draftName, draftId],
  );
  return <CodeBlock label="Snapshot id" value={snapshotId} />;
}

function PresetsCollapsible() {
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
      const preset = buildPreset(
        normalizedName,
        normalizedId,
        useConfigStore.getState().config,
      );
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

  return (
    <CollapsibleSection
      id="presets"
      title="Presets"
      hint={`${presets.length} saved`}
      action={loading ? <StatusPill label="Loading" tone="warn" /> : null}
    >
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
          onClick={() => {
            const c = useConfigStore.getState().config;
            exportPresetFile(
              buildPreset(
                draftName.trim() || 'Current Look',
                slugifyPresetId(draftId || draftName || 'current-look'),
                c,
              ),
            );
          }}
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
      <PresetSnapshotId draftName={draftName} draftId={draftId} />
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
    </CollapsibleSection>
  );
}
