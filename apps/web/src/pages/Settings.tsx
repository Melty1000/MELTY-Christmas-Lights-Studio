import { useMemo, useState } from 'react';
import {
  ActionButton,
  CodeBlock,
  MessageBanner,
  PageRoot,
  Panel,
  SectionGrid,
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

const QUALITY_OPTIONS = [
  { label: 'Billboard', value: 'billboard' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Ultra', value: 'ultra' },
];

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

  const apiTone =
    connection === 'connected' ? 'good' : connection === 'connecting' ? 'warn' : 'neutral';
  const sbTone = streamerbot.connected ? 'good' : 'neutral';

  return (
    <PageRoot>
      <SectionGrid columns={2}>
        <Panel
          title="Render"
          action={<StatusPill label={config.QUALITY} tone="accent" />}
        >
          <SelectField
            label="Quality"
            value={config.QUALITY}
            options={QUALITY_OPTIONS}
            onChange={(value) =>
              void patch({ QUALITY: value as 'billboard' | 'medium' | 'high' | 'ultra' })
            }
          />
          <ToggleField
            label="Wire network"
            checked={config.USE_WIRE_NETWORK}
            onChange={(value) => void patch({ USE_WIRE_NETWORK: value })}
          />
          <ToggleField
            label="Billboard high-wire debug"
            checked={config.BILLBOARD_DEBUG_HIGH_WIRE}
            onChange={(value) => void patch({ BILLBOARD_DEBUG_HIGH_WIRE: value })}
          />
          <div className="mt-1">
            <ActionButton tone="danger" onClick={() => void reset()} full>
              Reset config to defaults
            </ActionButton>
          </div>
        </Panel>

        <Panel title="Shell Theme">
          <SelectField
            label="Interface"
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
        </Panel>
      </SectionGrid>

      <SectionGrid columns={2}>
        <Panel title="Overlay URL">
          <CodeBlock label="OBS source" value={overlayUrl} />
          <div className="flex flex-wrap gap-2">
            <ActionButton
              onClick={() => {
                void navigator.clipboard.writeText(overlayUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied' : 'Copy URL'}
            </ActionButton>
            <ActionButton
              tone="secondary"
              onClick={() => window.open('/overlay', '_blank', 'noopener,noreferrer')}
            >
              Open in new tab
            </ActionButton>
          </div>
        </Panel>

        <Panel title="Connections">
          <div className="flex flex-wrap gap-2 px-2 py-1">
            <StatusPill label={`API ${connection}`} tone={apiTone} />
            <StatusPill
              label={streamerbot.connected ? 'Streamer.bot online' : 'Streamer.bot offline'}
              tone={sbTone}
            />
          </div>
          <MessageBanner tone={streamerbot.connected ? 'good' : 'neutral'}>
            <div>
              <span className="font-medium text-melt-text-heading">SB endpoint:</span>{' '}
              {streamerbot.url ?? 'Unavailable'}
            </div>
            {streamerbot.error ? (
              <div className="mt-1 text-red-200">{streamerbot.error}</div>
            ) : null}
            {lastError ? (
              <div className="mt-1 text-amber-200">Last error: {lastError}</div>
            ) : null}
          </MessageBanner>
        </Panel>
      </SectionGrid>
    </PageRoot>
  );
}
