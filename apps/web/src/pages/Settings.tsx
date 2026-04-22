import { useMemo, useState } from 'react';
import {
  ActionButton,
  CodeBlock,
  MessageBanner,
  MetricGrid,
  PageGrid,
  PageIntro,
  PanelCard,
  SelectField,
  StatusPill,
  ToggleField,
} from '~/components/controls/ControlPrimitives.tsx';
import {
  MELT_THEME_OPTIONS,
  applyMeltTheme,
  getStoredMeltTheme,
  type MeltTheme,
} from '~/lib/theme.ts';
import { useConfigStore } from '~/stores/useConfigStore.ts';

const ADVANCED_QUALITY_OPTIONS = [
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Ultra', value: 'ultra' },
] as const;

export function Settings() {
  const config = useConfigStore((state) => state.config);
  const connection = useConfigStore((state) => state.connection);
  const streamerbot = useConfigStore((state) => state.streamerbot);
  const lastError = useConfigStore((state) => state.lastError);
  const patch = useConfigStore((state) => state.patch);
  const reset = useConfigStore((state) => state.reset);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<MeltTheme>(() => getStoredMeltTheme());

  const overlayUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/overlay';
    return `${window.location.origin}/overlay`;
  }, []);

  const apiTone = connection === 'connected' ? 'good' : connection === 'connecting' ? 'warn' : 'neutral';
  const sbTone = streamerbot.connected ? 'good' : 'neutral';

  return (
    <div className="space-y-6 p-6">
      <PageIntro
        title="Runtime settings and overlay ops"
        description="This page keeps the product billboard-first while still preserving the advanced quality tiers in config. It also gives you reset and overlay helper tools without touching the backend contract."
        actions={<StatusPill label={`Quality: ${config.QUALITY}`} tone="accent" />}
      />

      <MetricGrid
        items={[
          {
            label: 'Primary Mode',
            value: config.QUALITY,
            detail: 'Billboard stays first-class while parity settles.',
            tone: 'accent',
          },
          {
            label: 'Website Theme',
            value: MELT_THEME_OPTIONS.find((option) => option.value === theme)?.label ?? theme,
            detail: 'Local shell styling shared with MELTY and SB.',
          },
          {
            label: 'API',
            value: connection,
            detail: 'Config patches and websocket sync.',
            tone: apiTone,
          },
          {
            label: 'Streamer.bot',
            value: streamerbot.connected ? 'Connected' : 'Offline',
            detail: 'Status-only for this recovery pass.',
            tone: sbTone === 'good' ? 'good' : 'neutral',
          },
        ]}
        columns={4}
      />

      <PageGrid>
        <div className="space-y-6">
          <PanelCard
            title="Quality strategy"
            description="Billboard is the primary exposed mode during the rewrite. The heavier tiers are still kept in config for compatibility and later comparison."
          >
            <button
              type="button"
              onClick={() => void patch({ QUALITY: 'billboard' })}
              className={`rounded-[18px] border px-4 py-4 text-left transition-colors duration-200 ${
                config.QUALITY === 'billboard'
                  ? 'border-melt-accent/25 bg-melt-accent/10'
                  : 'border-melt-text-muted/10 bg-melt-surface/20 hover:border-melt-accent/20'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black tracking-[0.14em] uppercase text-melt-text-heading">
                    Billboard
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-melt-text-label">
                    Primary mode for the rewrite. Uses the lighter-weight render path and is the mode we are actively matching to the legacy look.
                  </p>
                </div>
                <StatusPill label="Default" tone="accent" />
              </div>
            </button>

            <details className="rounded-[18px] border border-melt-text-muted/10 bg-melt-surface/20 p-4">
              <summary className="cursor-pointer list-none text-sm font-black tracking-[0.12em] uppercase text-melt-text-heading">
                Advanced quality modes
              </summary>
              <p className="mt-3 text-[11px] leading-relaxed text-melt-text-label">
                These stay hidden from the normal flow for now, but remain available so we can compare billboard against the legacy heavier paths when needed.
              </p>
              <div className="mt-4">
                <SelectField
                  label="Fallback tier"
                  hint="Only use these when you explicitly want to compare beyond billboard."
                  value={config.QUALITY === 'billboard' ? 'medium' : config.QUALITY}
                  options={ADVANCED_QUALITY_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                  onChange={(value) => void patch({ QUALITY: value as 'medium' | 'high' | 'ultra' })}
                />
              </div>
            </details>
          </PanelCard>

          <PanelCard
            title="Shell theme"
            description="This is local UI styling only. It does not touch the persisted lights config or the overlay scene."
          >
            <SelectField
              label="Interface theme"
              hint="Matches the shared MELTY / SB visual vocabulary."
              value={theme}
              options={MELT_THEME_OPTIONS.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              onChange={(value) => {
                const next = value as MeltTheme;
                setTheme(next);
                applyMeltTheme(next);
              }}
            />
            <MessageBanner>
              {MELT_THEME_OPTIONS.find((option) => option.value === theme)?.detail}
            </MessageBanner>
          </PanelCard>

          <PanelCard
            title="Overlay helper"
            description="Use this URL for OBS browser sources or any side-by-side look-dev checks."
          >
            <CodeBlock label="Overlay URL" value={overlayUrl} />
            <div className="flex flex-wrap gap-3">
              <ActionButton
                onClick={() => {
                  void navigator.clipboard.writeText(overlayUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? 'Copied' : 'Copy overlay URL'}
              </ActionButton>
              <ActionButton tone="secondary" onClick={() => window.open('/overlay', '_blank', 'noopener,noreferrer')}>
                Open overlay preview
              </ActionButton>
            </div>
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard
            title="Connections"
            description="Streamer.bot stays status-first in this pass. Nothing here should block scene controls if it is offline."
          >
            <div className="flex flex-wrap gap-3">
              <StatusPill label={`API ${connection}`} tone={apiTone} />
              <StatusPill label={streamerbot.connected ? 'Streamer.bot connected' : 'Streamer.bot offline'} tone={sbTone} />
            </div>
            <MessageBanner tone={streamerbot.connected ? 'good' : 'neutral'}>
              <div>
                <span className="font-medium text-melt-text-heading">Streamer.bot endpoint:</span>{' '}
                {streamerbot.url ?? 'Unavailable'}
              </div>
              {streamerbot.error ? (
                <div className="mt-2 text-red-200">{streamerbot.error}</div>
              ) : null}
              {lastError ? (
                <div className="mt-2 text-amber-200">Latest app warning: {lastError}</div>
              ) : null}
            </MessageBanner>
          </PanelCard>

          <PanelCard
            title="Maintenance"
            description="Quick runtime toggles and a safe reset back to the default config."
          >
            <ToggleField
              label="Wire network"
              hint="Reserved for deeper wire refactors. Left in config so comparisons stay possible."
              checked={config.USE_WIRE_NETWORK}
              onChange={(value) => void patch({ USE_WIRE_NETWORK: value })}
            />
            <ToggleField
              label="Billboard high-wire debug"
              hint="Temporary compatibility flag preserved while the billboard pass settles."
              checked={config.BILLBOARD_DEBUG_HIGH_WIRE}
              onChange={(value) => void patch({ BILLBOARD_DEBUG_HIGH_WIRE: value })}
            />
            <ActionButton tone="danger" onClick={() => void reset()}>
              Reset config to defaults
            </ActionButton>
          </PanelCard>
        </div>
      </PageGrid>
    </div>
  );
}
