import { useEffect, useMemo, useRef, useState } from 'react';
import type { Preset } from '@melty/shared';
import {
  ActionButton,
  CodeBlock,
  EmptyState,
  MessageBanner,
  MetricGrid,
  PageGrid,
  PageIntro,
  PanelCard,
  StatusPill,
  TextField,
} from '~/components/controls/ControlPrimitives.tsx';
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

export function Presets() {
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
  const builtInCount = presets.filter((preset) => preset.builtIn).length;
  const customCount = presets.length - builtInCount;

  return (
    <div className="space-y-6 p-6">
      <PageIntro
        title="Preset library"
        description="Everything here uses the existing preset routes only. Save or overwrite a preset from the live config, apply it back into the scene, and move JSON files in and out locally."
        actions={<StatusPill label={`${presets.length} presets`} tone="accent" />}
      />

      <MetricGrid
        items={[
          {
            label: 'Library Total',
            value: presets.length,
            detail: 'Combined built-in and custom entries.',
            tone: 'accent',
          },
          {
            label: 'Custom',
            value: customCount,
            detail: 'Editable presets saved from this rewrite.',
          },
          {
            label: 'Built In',
            value: builtInCount,
            detail: 'Reference looks kept read-only in the library.',
          },
          {
            label: 'Editor Target',
            value: selectedId ?? 'New Preset',
            detail: 'Current preset loaded into the save editor.',
          },
        ]}
        columns={4}
      />

      <PageGrid>
        <div className="space-y-6">
          <PanelCard
            title="Save the current look"
            description="The editor always snapshots the current config state, so what you see in the overlay is what gets written."
          >
            <TextField
              label="Preset name"
              hint="Human-readable label shown in the library."
              value={draftName}
              onChange={(value) => {
                setDraftName(value);
                if (!selectedId) {
                  setDraftId(slugifyPresetId(value));
                }
              }}
            />
            <TextField
              label="Preset id"
              hint="File-safe identifier used by the existing API route."
              value={draftId}
              onChange={(value) => setDraftId(slugifyPresetId(value))}
            />

            <div className="flex flex-wrap gap-3">
              <ActionButton onClick={() => void handleSave()} disabled={busy}>
                {selectedPreset && selectedPreset.id === draftId ? 'Update preset' : 'Save preset'}
              </ActionButton>
              <ActionButton tone="secondary" onClick={() => exportPresetFile(currentScenePreset)}>
                Export current config
              </ActionButton>
              <ActionButton tone="secondary" onClick={() => importInputRef.current?.click()} disabled={busy}>
                Import preset JSON
              </ActionButton>
              <ActionButton tone="secondary" onClick={() => void refreshPresets()} disabled={busy}>
                Refresh library
              </ActionButton>
              <ActionButton tone="secondary" onClick={clearEditor}>
                Clear editor
              </ActionButton>
            </div>

            <CodeBlock label="Current Snapshot Id" value={currentScenePreset.id} />

            {message ? <MessageBanner>{message}</MessageBanner> : null}

            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  void handleImport(file);
                }
                event.currentTarget.value = '';
              }}
            />
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard
            title="Preset library"
            description="Click a preset to load it into the editor, apply it directly to the scene, or export/delete it."
            aside={loading ? <StatusPill label="Loading" tone="warn" /> : null}
          >
            <div className="grid gap-3">
              {presets.length === 0 && !loading ? (
                <EmptyState>
                  No presets saved yet. Save the current look or import a preset JSON file to get started.
                </EmptyState>
              ) : null}

              {presets.map((preset) => (
                <article
                  key={preset.id}
                  className={`rounded-[18px] border px-4 py-4 transition-colors duration-200 ${
                    selectedId === preset.id
                      ? 'border-melt-accent/25 bg-melt-accent/8'
                      : 'border-melt-text-muted/10 bg-melt-surface/20 hover:border-melt-accent/20'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        onClick={() => loadIntoEditor(preset)}
                        className="text-left"
                      >
                        <div className="text-sm font-black tracking-[0.1em] uppercase text-melt-text-heading">
                          {preset.name}
                        </div>
                        <div className="mt-2 font-mono text-[11px] text-melt-text-label">{preset.id}</div>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {preset.builtIn ? <StatusPill label="Built in" tone="neutral" /> : <StatusPill label="Custom" tone="accent" />}
                      {preset.createdAt ? (
                        <StatusPill label={new Date(preset.createdAt).toLocaleDateString()} tone="neutral" />
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton tone="secondary" onClick={() => void handleApply(preset.id)} disabled={busy}>
                      Apply
                    </ActionButton>
                    <ActionButton tone="secondary" onClick={() => exportPresetFile(preset)}>
                      Export
                    </ActionButton>
                    {!preset.builtIn ? (
                      <ActionButton tone="danger" onClick={() => void handleDelete(preset.id)} disabled={busy}>
                        Delete
                      </ActionButton>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </PanelCard>
        </div>
      </PageGrid>
    </div>
  );
}
