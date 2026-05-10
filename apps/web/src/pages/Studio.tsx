import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import clsx from 'clsx';
import {
  ANIMATION_STYLES,
  BULB_ORIENTATION_MODE_NAMES,
  LAYOUT_MODE_NAMES,
  normalizeLayoutEdges,
  SOCKET_THEME_NAMES,
  THEME_NAMES,
  THEMES,
  WIRE_THEME_NAMES,
  type BulbOrientationModeName,
  type LayoutEdgeName,
  type LayoutModeName,
  type Preset,
} from '@melty/shared';
import {
  ActionButton,
  CodeBlock,
  ColorStrip,
  EmptyState,
  MessageBanner,
  Panel,
  PageRoot,
  SectionGrid,
  StatusPill,
  TextField,
} from '~/components/controls/ControlPrimitives.tsx';
import { WireSimpleControls } from '~/components/controls/WireControls.tsx';
import {
  BoundSelect,
  BoundSlider,
  BoundToggle,
} from '~/components/controls/BoundFields.tsx';
import { formatToken } from '~/lib/format.ts';
import {
  applyPreset,
  buildPreset,
  copyTextToClipboard,
  exportPresetFile,
  fetchPresets,
  importPresetFile,
  removePreset,
  savePreset,
  serializePreset,
  slugifyPresetId,
} from '~/lib/presets.ts';
import { studioTabIdFromPath } from '~/lib/studioTabs.ts';
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
// Layout: MeltShell owns the sidebar tabs. Studio reads the current route and
// renders the matching control group. Each field owns its own store
// subscription, so slider ticks stay scoped to the active panel.
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
const LAYOUT_MODE_LABELS: Record<LayoutModeName, string> = {
  EDGES: 'Screen Edges',
  SHAPE: 'Shape',
};
const LAYOUT_MODE_OPTIONS = LAYOUT_MODE_NAMES.map((name) => ({
  label: LAYOUT_MODE_LABELS[name],
  value: name,
}));
const LAYOUT_EDGE_LABELS: Record<LayoutEdgeName, string> = {
  TOP: 'Top',
  RIGHT: 'Right',
  BOTTOM: 'Bottom',
  LEFT: 'Left',
};
const BULB_ORIENTATION_LABELS: Record<BulbOrientationModeName, string> = {
  LAYOUT: 'Layout',
  NATURAL: 'Natural',
};
const BULB_ORIENTATION_OPTIONS = BULB_ORIENTATION_MODE_NAMES.map((name) => ({
  label: BULB_ORIENTATION_LABELS[name],
  value: name,
}));

export function Studio() {
  const location = useLocation();
  const activeTab = studioTabIdFromPath(location.pathname);

  return (
    <PageRoot>
      {activeTab === 'layout' ? <LayoutTab /> : null}
      {activeTab === 'theme' ? <ThemeTab /> : null}
      {activeTab === 'lighting' ? <LightingTab /> : null}
      {activeTab === 'motion' ? <MotionTab /> : null}
      {activeTab === 'environment' ? <EnvironmentTab /> : null}
      {activeTab === 'presets' ? <PresetsPanel /> : null}
    </PageRoot>
  );
}

function LayoutTab() {
  return (
    <SectionGrid columns={1}>
      <LightLayoutSection />
      <AdvancedCameraPanel />
    </SectionGrid>
  );
}

function ThemeTab() {
  return (
    <SectionGrid columns={1}>
      <ThemeSection />
    </SectionGrid>
  );
}

function LightingTab() {
  return (
    <SectionGrid columns={1}>
      <LightingPanel />
      <PostFxPanel />
    </SectionGrid>
  );
}

function MotionTab() {
  return (
    <SectionGrid columns={1}>
      <MotionPanel />
      <TwinklePanel />
    </SectionGrid>
  );
}

function EnvironmentTab() {
  return (
    <SectionGrid columns={1}>
      <EnvironmentPanel />
      <SnowPanel />
      <StarsPanel />
    </SectionGrid>
  );
}

function LightLayoutSection() {
  const layout = useConfigStore(useShallow((s) => ({
    mode: s.config.LAYOUT_MODE,
    edges: s.config.LAYOUT_EDGES,
    shapeSides: s.config.LAYOUT_SHAPE_SIDES,
    cornerRoundness: s.config.LAYOUT_CORNER_ROUNDNESS,
  })));

  return (
    <Panel
      title="Light Layout"
      action={<StatusPill label={layoutStatus(layout)} tone="accent" />}
    >
      <LayoutModeSelector />
      <BoundSlider control="SPANS" />
      <BoundSlider control="LIGHTS_PER_SEGMENT" />
      <BoundSlider control="SAG_AMPLITUDE" />
      <BoundSlider control="BULB_SCALE" />
      <WireSimpleControls />
      {layout.mode === 'EDGES' ? <ScreenEdgePicker /> : null}
      {layout.mode === 'SHAPE' ? <ShapeLayoutControl /> : null}
      <BoundSelect field="BULB_ORIENTATION_MODE" label="Bulb orientation" options={BULB_ORIENTATION_OPTIONS} />
      <LayoutSizeControls mode={layout.mode} />
      <BoundSlider control="LAYOUT_POSITION_X" />
      <BoundSlider control="LAYOUT_POSITION_Y" />
    </Panel>
  );
}

function layoutStatus(layout: {
  mode: LayoutModeName;
  edges: LayoutEdgeName[];
  shapeSides: number;
  cornerRoundness: number;
}): string {
  if (layout.mode === 'EDGES') {
    return normalizeLayoutEdges(layout.edges).join('+');
  }
  return layout.cornerRoundness >= 0.995 ? 'Circle' : `${layout.shapeSides} Sides`;
}

function LayoutModeSelector() {
  const mode = useConfigStore((s) => s.config.LAYOUT_MODE);
  const patch = useConfigStore((s) => s.patch);

  const handleModeChange = useCallback(
    (nextMode: LayoutModeName) => {
      void patch({ LAYOUT_MODE: nextMode });
    },
    [patch],
  );

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 px-0 py-1.5">
      <span className="truncate text-[11px] font-semibold tracking-wide text-melt-text-label">
        Mode
      </span>
      <div className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-melt-text-muted/15 bg-melt-frame/35 p-0.5">
        {LAYOUT_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => handleModeChange(option.value)}
            aria-pressed={mode === option.value}
            className={clsx(
              'rounded-[4px] px-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
              mode === option.value
                ? 'bg-melt-accent text-melt-frame'
                : 'text-melt-text-muted hover:bg-melt-surface/25 hover:text-melt-text-heading',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LayoutSizeControls({ mode }: { mode: LayoutModeName }) {
  switch (mode) {
    case 'EDGES':
      return (
        <>
          <BoundSlider control="LAYOUT_CORNER_ROUNDNESS" />
          <BoundSlider control="EDGE_INSET" />
          <BoundSlider control="EDGE_COVERAGE" />
        </>
      );
    case 'SHAPE':
      return (
        <>
          <BoundSlider control="SHAPE_PADDING" />
        </>
      );
  }
}

function ScreenEdgePicker() {
  const edges = useConfigStore((s) => s.config.LAYOUT_EDGES);
  const patch = useConfigStore((s) => s.patch);
  const selectedEdges = normalizeLayoutEdges(edges);
  const selected = new Set(selectedEdges);
  const isLocked = selectedEdges.length === 1;

  const handleToggle = useCallback(
    (edge: LayoutEdgeName) => {
      const current = normalizeLayoutEdges(useConfigStore.getState().config.LAYOUT_EDGES);
      const hasEdge = current.includes(edge);
      if (hasEdge && current.length === 1) return;
      const next = hasEdge
        ? current.filter((item) => item !== edge)
        : normalizeLayoutEdges([...current, edge]);
      void patch({ LAYOUT_MODE: 'EDGES', LAYOUT_EDGES: next });
    },
    [patch],
  );

  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 px-0 py-2">
      <span className="truncate text-[11px] font-semibold tracking-wide text-melt-text-label">
        Edges
      </span>
      <div className="relative mx-auto aspect-[16/9] w-full max-w-[460px] overflow-hidden rounded-md border border-melt-text-muted/15 bg-[#08090c] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="absolute inset-[13%] border border-melt-text-muted/10 bg-melt-frame/35" />
        <div className="absolute inset-[13%] bg-[radial-gradient(circle_at_center,rgba(255,179,0,0.055),transparent_56%)]" />

        <EdgeRail
          edge="TOP"
          selected={selected.has('TOP')}
          locked={isLocked && selected.has('TOP')}
          onToggle={handleToggle}
        />
        <EdgeRail
          edge="RIGHT"
          selected={selected.has('RIGHT')}
          locked={isLocked && selected.has('RIGHT')}
          onToggle={handleToggle}
        />
        <EdgeRail
          edge="BOTTOM"
          selected={selected.has('BOTTOM')}
          locked={isLocked && selected.has('BOTTOM')}
          onToggle={handleToggle}
        />
        <EdgeRail
          edge="LEFT"
          selected={selected.has('LEFT')}
          locked={isLocked && selected.has('LEFT')}
          onToggle={handleToggle}
        />

      </div>
    </div>
  );
}

function EdgeRail({
  edge,
  selected,
  locked,
  onToggle,
}: {
  edge: LayoutEdgeName;
  selected: boolean;
  locked: boolean;
  onToggle: (edge: LayoutEdgeName) => void;
}) {
  const horizontal = edge === 'TOP' || edge === 'BOTTOM';
  const placement: Record<LayoutEdgeName, string> = {
    TOP: 'left-[13%] right-[13%] top-[5%] h-[18%]',
    RIGHT: 'right-[4%] top-[13%] bottom-[13%] w-[18%]',
    BOTTOM: 'left-[13%] right-[13%] bottom-[5%] h-[18%]',
    LEFT: 'left-[4%] top-[13%] bottom-[13%] w-[18%]',
  };
  const railPlacement: Record<LayoutEdgeName, string> = {
    TOP: 'left-0 right-0 top-1/2 h-[5px] -translate-y-1/2',
    RIGHT: 'top-0 bottom-0 left-1/2 w-[5px] -translate-x-1/2',
    BOTTOM: 'left-0 right-0 top-1/2 h-[5px] -translate-y-1/2',
    LEFT: 'top-0 bottom-0 left-1/2 w-[5px] -translate-x-1/2',
  };

  return (
    <button
      type="button"
      aria-label={`${LAYOUT_EDGE_LABELS[edge]} edge`}
      onClick={() => onToggle(edge)}
      disabled={locked}
      aria-pressed={selected}
      className={clsx(
        'group absolute rounded-[4px] outline-none transition-colors',
        placement[edge],
        locked ? 'cursor-default' : 'cursor-pointer',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'absolute rounded-full transition-all duration-150',
          railPlacement[edge],
          selected
            ? 'bg-melt-accent shadow-[0_0_16px_rgba(255,179,0,0.55)]'
            : 'bg-melt-text-muted/18 group-hover:bg-melt-accent/55',
        )}
      />
      <span
        aria-hidden
        className={clsx(
          'absolute rounded-full transition-all duration-150',
          horizontal ? 'left-2 right-2 top-1/2 h-px -translate-y-1/2' : 'top-2 bottom-2 left-1/2 w-px -translate-x-1/2',
          selected ? 'bg-white/22' : 'bg-white/0 group-hover:bg-white/12',
        )}
      />
    </button>
  );
}

function ShapeLayoutControl() {
  const shape = useConfigStore(useShallow((s) => ({
    sides: s.config.LAYOUT_SHAPE_SIDES,
    roundness: s.config.LAYOUT_CORNER_ROUNDNESS,
  })));
  const patch = useConfigStore((s) => s.patch);
  const previewPath = useMemo(
    () => shapePreviewPath(shape.sides, shape.roundness),
    [shape.roundness, shape.sides],
  );

  const handleSidesChange = useCallback(
    (nextSides: number) => {
      void patch({
        LAYOUT_MODE: 'SHAPE',
        LAYOUT_SHAPE_SIDES: Math.max(3, Math.min(10, Math.round(nextSides))),
      });
    },
    [patch],
  );

  return (
    <>
      <div className="grid grid-cols-[120px_1fr] items-center gap-3 px-0 py-2">
        <span className="truncate text-[11px] font-semibold tracking-wide text-melt-text-label">
          Sides
        </span>
        <div className="grid grid-cols-[1fr_72px] items-center gap-3">
          <div className="relative h-[112px] overflow-hidden rounded-md border border-melt-text-muted/15 bg-[#08090c]">
            <svg aria-hidden viewBox="0 0 160 112" className="size-full">
              <path
                d={previewPath}
                fill="rgba(255,179,0,0.08)"
                stroke="rgba(255,179,0,0.95)"
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <circle cx="80" cy="56" r="2.5" fill="rgba(255,255,255,0.32)" />
            </svg>
          </div>
          <div className="grid grid-rows-[36px_40px_36px] gap-1">
            <button
              type="button"
              disabled={shape.sides >= 10}
              onClick={() => handleSidesChange(shape.sides + 1)}
              className="h-9 rounded-md bg-melt-frame/35 text-[15px] font-black text-melt-text-heading transition-colors hover:bg-melt-surface/25 disabled:cursor-not-allowed disabled:opacity-35"
            >
              +
            </button>
            <div className="flex h-10 items-center justify-center rounded-md bg-melt-frame/35 text-[12px] font-black uppercase tracking-[0.16em] text-melt-text-heading">
              {shape.sides}
            </div>
            <button
              type="button"
              disabled={shape.sides <= 3}
              onClick={() => handleSidesChange(shape.sides - 1)}
              className="h-9 rounded-md bg-melt-frame/35 text-[15px] font-black text-melt-text-heading transition-colors hover:bg-melt-surface/25 disabled:cursor-not-allowed disabled:opacity-35"
            >
              -
            </button>
          </div>
        </div>
      </div>
      <BoundSlider control="LAYOUT_CORNER_ROUNDNESS" />
    </>
  );
}

function shapePreviewPath(sides: number, roundness: number): string {
  const safeSides = Math.max(3, Math.min(10, Math.round(sides)));
  const safeRoundness = Math.max(0, Math.min(1, roundness));
  const cx = 80;
  const cy = 56;
  const radius = 38;
  const points = Array.from({ length: safeSides }, (_, index) => {
    const angle = -Math.PI / 2 + (index / safeSides) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });

  if (safeRoundness <= 0.02) {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ') + ' Z';
  }

  const cornerCut = 0.18 + safeRoundness * 0.28;
  return points
    .map((point, index) => {
      const prev = points[(index - 1 + points.length) % points.length]!;
      const next = points[(index + 1) % points.length]!;
      const from = {
        x: point.x + (prev.x - point.x) * cornerCut,
        y: point.y + (prev.y - point.y) * cornerCut,
      };
      const to = {
        x: point.x + (next.x - point.x) * cornerCut,
        y: point.y + (next.y - point.y) * cornerCut,
      };
      const start = index === 0 ? `M ${from.x.toFixed(2)} ${from.y.toFixed(2)}` : `L ${from.x.toFixed(2)} ${from.y.toFixed(2)}`;
      return `${start} Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
    })
    .join(' ') + ' Z';
}

function AdvancedCameraPanel() {
  return (
    <Panel title="Advanced Camera" action={<StatusPill label="Fine Tune" tone="neutral" />}>
      <BoundSlider control="CAMERA_DISTANCE" />
      <BoundSlider control="CAMERA_HEIGHT" />
      <BoundSlider control="CAMERA_X" />
    </Panel>
  );
}

function LightingPanel() {
  return (
    <Panel title="Lighting">
      <BoundSlider control="AMBIENT_INTENSITY" />
      <BoundSlider control="GLASS_OPACITY" />
      <BoundSlider control="GLASS_ROUGHNESS" />
      <BoundSlider control="REFLECTION_INTENSITY" />
    </Panel>
  );
}

function PostFxPanel() {
  return (
    <Panel title="Post FX / Halo">
      <BoundSlider control="BULB_INTERNAL_GLOW" />
      <BoundSlider control="HALO_SOURCE_INTENSITY" />
      <BoundSlider control="HALO_STRENGTH" />
      <BoundSlider control="HALO_RADIUS" />
      <BoundSlider control="HALO_INTENSITY" />
    </Panel>
  );
}

function MotionPanel() {
  return (
    <Panel title="Motion">
      <BoundSlider control="ANIMATION_SPEED" />
      <BoundSlider control="SWAY_X" />
      <BoundSlider control="SWAY_Z" />
    </Panel>
  );
}

function TwinklePanel() {
  return (
    <Panel title="Twinkle">
      <BoundSelect field="ANIMATION_STYLE" label="Style" options={ANIMATION_OPTIONS} />
      <BoundSlider control="TWINKLE_SPEED" />
      <BoundSlider control="TWINKLE_MIN_INTENSITY" />
      <BoundSlider control="TWINKLE_MAX_INTENSITY" />
      <BoundSlider control="TWINKLE_RANDOMNESS" />
    </Panel>
  );
}

function EnvironmentPanel() {
  return (
    <Panel title="Environment">
      <BoundToggle field="BACKGROUND_ENABLED" label="Solid background" />
      <BoundToggle field="ANTIALIAS_ENABLED" label="Antialiasing" />
      <BoundToggle field="STATS_ENABLED" label="Stats panel" />
    </Panel>
  );
}

function SnowPanel() {
  return (
    <Panel title="Snow">
      <BoundToggle field="SNOW_ENABLED" label="Enable snow" />
      <BoundSlider control="SNOW_COUNT" />
      <BoundSlider control="SNOW_SPEED" />
      <BoundSlider control="SNOW_SIZE" />
      <BoundSlider control="SNOW_DRIFT" />
    </Panel>
  );
}

function StarsPanel() {
  return (
    <Panel title="Stars">
      <BoundToggle field="STARS_ENABLED" label="Enable stars" />
      <BoundSlider control="STARS_COUNT" />
      <BoundSlider control="STARS_SIZE" />
      <BoundSlider control="STARS_OPACITY" />
      <BoundSlider control="STARS_TWINKLE_SPEED" />
    </Panel>
  );
}

// Theme section is split out because it reads the live palette + label to
// feed the header hint and <ColorStrip>. Extracting it keeps the main
// Studio body free of a config subscription entirely.
function ThemeSection() {
  const activeThemeKey = useConfigStore((s) => s.config.ACTIVE_THEME);
  const activeTheme = THEMES[activeThemeKey];

  return (
    <Panel
      title="Theme & Colors"
      action={<StatusPill label={formatToken(activeThemeKey)} tone="accent" />}
    >
      <BoundSelect field="ACTIVE_THEME" label="Bulb theme" options={THEME_OPTIONS} />
      <BoundSelect field="SOCKET_THEME" label="Socket theme" options={SOCKET_OPTIONS} />
      <BoundSelect field="WIRE_THEME" label="Wire theme" options={WIRE_OPTIONS} />
      <ColorStrip colors={activeTheme.bulbs} />
    </Panel>
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

function PresetsPanel() {
  const hydrate = useConfigStore((state) => state.hydrate);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [draftName, setDraftName] = useState('Stage Look');
  const [draftId, setDraftId] = useState('stage-look');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastExportPreset, setLastExportPreset] = useState<Preset | null>(null);
  const [lastExportJson, setLastExportJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const exportTextAreaRef = useRef<HTMLTextAreaElement | null>(null);

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

  function handleExport(preset: Preset) {
    const json = serializePreset(preset);
    setLastExportPreset(preset);
    setLastExportJson(json);
    setMessage(`Prepared export "${preset.name}". JSON is shown below.`);
  }

  function handleExportCurrent() {
    try {
      const c = useConfigStore.getState().config;
      handleExport(
        buildPreset(
          draftName.trim() || 'Current Look',
          slugifyPresetId(draftId || draftName || 'current-look'),
          c,
        ),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCopyExportJson() {
    if (!lastExportJson) return;

    if (await copyTextToClipboard(lastExportJson)) {
      setMessage('Copied export JSON to clipboard.');
      return;
    }

    const textArea = exportTextAreaRef.current;
    if (textArea) {
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, textArea.value.length);
      try {
        if (document.execCommand?.('copy')) {
          setMessage('Copied export JSON to clipboard.');
          return;
        }
      } catch {
        // Some embedded browsers expose execCommand but block clipboard writes.
      }
    }

    setMessage('Selected export JSON. Press Ctrl+C to copy.');
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
    <Panel
      title="Presets"
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
          onClick={() => void handleExportCurrent()}
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
      {lastExportJson ? (
        <div className="rounded-md border border-melt-text-muted/15 bg-melt-frame/60 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[9px] font-black tracking-[0.22em] uppercase text-melt-text-muted">
              Latest export JSON
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton tone="secondary" onClick={() => void handleCopyExportJson()}>
                Copy JSON
              </ActionButton>
              <ActionButton
                tone="secondary"
                onClick={() => {
                  if (lastExportPreset) exportPresetFile(lastExportPreset);
                }}
              >
                Download JSON
              </ActionButton>
            </div>
          </div>
          <textarea
            ref={exportTextAreaRef}
            aria-label="Latest export JSON"
            className="mt-2 h-[220px] w-full resize-y overflow-auto rounded border border-melt-text-muted/10 bg-[#07080b] p-3 font-mono text-[10px] leading-5 text-melt-text-heading outline-none focus:border-melt-accent/40"
            readOnly
            value={lastExportJson}
          />
        </div>
      ) : null}
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
              <ActionButton tone="secondary" onClick={() => void handleExport(preset)}>
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
    </Panel>
  );
}
