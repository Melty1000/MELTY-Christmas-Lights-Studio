import { create } from 'zustand';
import {
  type Config,
  type ConfigPatch,
  DEFAULT_CONFIG,
  type WsServerMessage,
  applyLayoutGuardrails,
  applyWireGuardrails,
  withLayoutCameraDefaults,
  withWireGuardrails,
  wsServerMessageSchema,
} from '@melty/shared';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface StreamerbotStatus {
  connected: boolean;
  url?: string;
  error?: string;
}

interface ConfigStore {
  config: Config;
  connection: ConnectionStatus;
  lastError: string | null;
  streamerbot: StreamerbotStatus;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  patch: (patch: ConfigPatch) => Promise<void>;
  reset: () => Promise<void>;
  connectWs: () => void;
  disconnectWs: () => void;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Coalesced-patch plumbing.
//
// Slider `onChange` handlers fire per pixel of drag — dozens of calls per
// second. Sending one `PATCH /api/config` per call hammers the browser's
// per-origin request queue and the API's WebSocket fan-out, which makes the
// control panel feel laggy even though the optimistic local `set` is
// synchronous. We accumulate every field into `pendingPatch` and flush the
// merged result on the next animation frame, so the UI stays instant while
// the wire traffic is capped at ~60 req/s per origin with every in-flight
// field merged.
let pendingPatch: ConfigPatch = {};
let networkFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pageHideFlushAttached = false;

// Trailing debounce (ms) for PATCH /api/config only. The optimistic `set`
// in `patch()` is still instant every tick so the 3D scene + slider values
// stay in sync, but capping the wire traffic stops the browser from
// queueing 50–60 fetches per second (HTTP/1.1 does ~6 in-flight per
// host — the rest wait and jank the main thread).
const PATCH_SEND_DEBOUNCE_MS = 40;

// Self-echo suppression window.
//
// The API broadcasts every applied patch to EVERY connected WebSocket
// client, including the one that originated it. That means during a drag:
//
//   t=0   user drags → local=0.50, PATCH sent
//   t=20  user drags → local=0.55, PATCH sent
//   t=30  server echoes first patch via WS → we receive {val: 0.50} and
//         merge → local *regresses* to 0.50 mid-drag
//   t=50  server echoes second patch → local=0.55 again
//   ...
//
// The visible symptom is exactly what the user described: sliders "tick
// down and down" back toward earlier positions while dragging, then jump
// to the final value once the echoes catch up. The fix is to tag every
// field we locally write with an expiry timestamp and ignore incoming WS
// `config:update` entries for that field until the expiry passes. 1s is
// long enough to cover server + network round-trip for any realistic
// Christmas-lights deployment and short enough that external sources
// (streamer.bot, presets) still take effect promptly once the user stops
// dragging.
const SELF_ECHO_WINDOW_MS = 1000;
const WIRE_SYNC_KEYS = [
  'WIRE_TUNING_MODE',
  'WIRE_WEIGHT',
  'TWIST_DENSITY',
  'ADVANCED_WIRE_THICKNESS',
  'ADVANCED_WIRE_SEPARATION',
  'ADVANCED_WIRE_TWISTS',
] as const;

interface LocalWriteMeta {
  expiresAt: number;
  touchedAt: number;
}

const recentLocalWrites = new Map<string, LocalWriteMeta>();

function markLocalWrites(patch: ConfigPatch): void {
  const touchedAt = Date.now();
  const expiry = Date.now() + SELF_ECHO_WINDOW_MS;
  for (const key of Object.keys(patch)) {
    recentLocalWrites.set(key, { expiresAt: expiry, touchedAt });
  }
}

function filterEchoedPatch(patch: ConfigPatch): ConfigPatch {
  const now = Date.now();
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(patch)) {
    if (pendingPatch[key as keyof ConfigPatch] !== undefined) {
      continue;
    }

    const meta = recentLocalWrites.get(key);
    if (meta !== undefined) {
      if (now < meta.expiresAt) {
        // Still within the self-echo window — drop the echoed value, the
        // local write wins.
        continue;
      }
      // Expired — remove from map and accept the server value.
      recentLocalWrites.delete(key);
    }
    out[key] = value;
    kept++;
  }
  return kept > 0 ? (out as ConfigPatch) : {};
}

function protectedLocalKeys(newerThan = -Infinity): Set<keyof Config> {
  const now = Date.now();
  const keys = new Set<keyof Config>();
  for (const key of Object.keys(pendingPatch) as Array<keyof Config>) {
    keys.add(key);
  }
  for (const [key, meta] of recentLocalWrites) {
    if (now >= meta.expiresAt) {
      recentLocalWrites.delete(key);
      continue;
    }
    if (meta.touchedAt > newerThan) {
      keys.add(key as keyof Config);
    }
  }

  if (WIRE_SYNC_KEYS.some((key) => keys.has(key))) {
    for (const key of WIRE_SYNC_KEYS) keys.add(key);
  }
  return keys;
}

function mergeServerConfig(
  serverConfig: Config,
  localConfig: Config,
  protectedKeys = protectedLocalKeys(),
): Config {
  const guarded = applyWireGuardrails(applyLayoutGuardrails(serverConfig));
  if (protectedKeys.size === 0) return guarded;

  const merged = { ...guarded } as Config;
  for (const key of protectedKeys) {
    (merged as Record<string, unknown>)[key] = localConfig[key];
  }
  return applyWireGuardrails(applyLayoutGuardrails(merged));
}

function clearAcknowledgedLocalWrites(keys: string[], sentAt: number): void {
  for (const key of keys) {
    if (pendingPatch[key as keyof ConfigPatch] !== undefined) continue;
    const meta = recentLocalWrites.get(key);
    if (meta && meta.touchedAt <= sentAt) {
      recentLocalWrites.delete(key);
    }
  }
}

function sendPatchViaSocket(patch: ConfigPatch): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify({ type: 'config:patch', patch }));
    return true;
  } catch {
    return false;
  }
}

async function sendPatchViaRest(patch: ConfigPatch, keepalive = false): Promise<Config> {
  const res = await fetch('/api/config', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
    keepalive,
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/config -> ${res.status}`);
  }
  return (await res.json()) as Config;
}

function takePendingPatch(): ConfigPatch {
  const toSend = pendingPatch;
  pendingPatch = {};
  return toSend;
}

function flushPendingPatchBeforeUnload(): void {
  if (networkFlushTimer) {
    clearTimeout(networkFlushTimer);
    networkFlushTimer = null;
  }

  const toSend = takePendingPatch();
  if (Object.keys(toSend).length === 0) return;

  sendPatchViaSocket(toSend);
  void sendPatchViaRest(toSend, true);
}

function attachPageHideFlush(): void {
  if (pageHideFlushAttached || typeof window === 'undefined') return;
  pageHideFlushAttached = true;
  window.addEventListener('pagehide', flushPendingPatchBeforeUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPatchBeforeUnload();
  });
}

function schedulePatchFlush(
  set: (partial: Partial<ConfigStore> | ((s: ConfigStore) => Partial<ConfigStore>)) => void,
  get: () => ConfigStore,
) {
  attachPageHideFlush();
  if (networkFlushTimer) return;
  if (typeof setTimeout === 'function') {
    networkFlushTimer = setTimeout(() => {
      networkFlushTimer = null;
      void (async () => {
        const toSend = takePendingPatch();
        const sentAt = Date.now();
        const sentKeys = Object.keys(toSend);
        if (Object.keys(toSend).length === 0) return;
        try {
          const serverConfig = await sendPatchViaRest(toSend);
          set((state) => ({
            config: mergeServerConfig(
              serverConfig,
              state.config,
              protectedLocalKeys(sentAt),
            ),
            lastError: null,
          }));
          clearAcknowledgedLocalWrites(sentKeys, sentAt);
        } catch (err) {
          clearAcknowledgedLocalWrites(sentKeys, sentAt);
          set({ lastError: err instanceof Error ? err.message : String(err) });
          void get().hydrate();
        }
      })();
    }, PATCH_SEND_DEBOUNCE_MS);
  } else {
    const toSend = takePendingPatch();
    if (Object.keys(toSend).length === 0) return;
    void (async () => {
      const sentAt = Date.now();
      const sentKeys = Object.keys(toSend);
      try {
        const serverConfig = await sendPatchViaRest(toSend);
        set((state) => ({
          config: mergeServerConfig(
            serverConfig,
            state.config,
            protectedLocalKeys(sentAt),
          ),
          lastError: null,
        }));
        clearAcknowledgedLocalWrites(sentKeys, sentAt);
      } catch (err) {
        clearAcknowledgedLocalWrites(sentKeys, sentAt);
        set({ lastError: err instanceof Error ? err.message : String(err) });
        void get().hydrate();
      }
    })();
  }
}

function wsUrl(): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  connection: 'idle',
  lastError: null,
  streamerbot: { connected: false },
  hydrated: false,

  async hydrate() {
    try {
      const [configRes, streamerbotRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/streamerbot/status'),
      ]);

      if (!configRes.ok) {
        throw new Error(`GET /api/config -> ${configRes.status}`);
      }

      const serverConfig = (await configRes.json()) as Config;
      const streamerbot = streamerbotRes.ok
        ? (await streamerbotRes.json()) as StreamerbotStatus
        : {
          connected: false,
          error: `GET /api/streamerbot/status -> ${streamerbotRes.status}`,
        };

      set({
        config: mergeServerConfig(serverConfig, get().config),
        hydrated: true,
        lastError: null,
        streamerbot,
      });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  async patch(patch) {
    const expandedPatch = withWireGuardrails(
      withLayoutCameraDefaults(patch, get().config),
      get().config,
    );
    // Apply optimistically so the UI (sliders, preview) reacts this frame.
    set((state) => ({
      config: applyWireGuardrails(applyLayoutGuardrails({
        ...state.config,
        ...expandedPatch,
      })),
    }));
    // Record which keys this client has just written so the WS broadcast
    // echo for these fields gets filtered out until the user stops
    // dragging.
    markLocalWrites(expandedPatch);
    // Merge into the pending buffer and schedule a single rAF-coalesced
    // network flush. Later keys in the same drag naturally overwrite earlier
    // ones via Object.assign.
    Object.assign(pendingPatch, expandedPatch);
    // The live preview and OBS overlay are separate documents, so the local
    // optimistic set above cannot update their scene. Send the same patch over
    // the already-open WebSocket immediately; the debounced REST write below
    // remains the durability/ack path.
    sendPatchViaSocket(expandedPatch);
    schedulePatchFlush(set, get);
  },

  async reset() {
    try {
      const res = await fetch('/api/config/reset', {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`POST /api/config/reset -> ${res.status}`);
      }
      const body = (await res.json()) as Config;
      set({
        config: body,
        hydrated: true,
        lastError: null,
      });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
      void get().hydrate();
    }
  },

  connectWs() {
    if (socket && socket.readyState !== WebSocket.CLOSED) return;
    set({ connection: 'connecting' });
    const ws = new WebSocket(wsUrl());
    socket = ws;

    ws.addEventListener('open', () => {
      set({ connection: 'connected', lastError: null });
    });

    ws.addEventListener('close', () => {
      set({ connection: 'disconnected' });
      socket = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => get().connectWs(), 1000);
    });

    ws.addEventListener('error', (ev) => {
      set({ lastError: `WebSocket error: ${String(ev)}` });
    });

    ws.addEventListener('message', (ev) => {
      try {
        const parsed = wsServerMessageSchema.parse(JSON.parse(String(ev.data)));
        handleServerMessage(parsed, set);
      } catch (err) {
        console.warn('[ws] invalid message', err);
      }
    });
  },

  disconnectWs() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
    set({ connection: 'idle' });
  },
}));

function handleServerMessage(
  msg: WsServerMessage,
  set: (partial: Partial<ConfigStore> | ((s: ConfigStore) => Partial<ConfigStore>)) => void,
) {
  switch (msg.type) {
    case 'config:snapshot':
      set((state) => ({
        config: mergeServerConfig(msg.config, state.config),
        hydrated: true,
      }));
      return;
    case 'config:update': {
      // Strip out keys this client wrote recently — those echoes were
      // overwriting the live local value mid-drag (see comment on
      // `recentLocalWrites` in useConfigStore). Remote-sourced updates
      // (streamer.bot, preset apply) aren't in our local-writes map and
      // pass through unfiltered, so they still land immediately.
      const filtered = filterEchoedPatch(msg.patch);
      if (Object.keys(filtered).length === 0) return;
      set((state) => ({
        config: applyWireGuardrails(applyLayoutGuardrails({
          ...state.config,
          ...filtered,
        })),
      }));
      return;
    }
    case 'streamerbot:status':
      set({
        streamerbot: {
          connected: msg.connected,
          url: msg.url,
          error: msg.error,
        },
      });
      return;
    case 'streamerbot:event':
      return;
    case 'error':
      set({ lastError: msg.message });
      return;
  }
}
