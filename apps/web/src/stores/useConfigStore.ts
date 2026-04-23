import { create } from 'zustand';
import {
  type Config,
  type ConfigPatch,
  DEFAULT_CONFIG,
  type WsServerMessage,
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
const recentLocalWrites = new Map<string, number>();

function markLocalWrites(patch: ConfigPatch): void {
  const expiry = Date.now() + SELF_ECHO_WINDOW_MS;
  for (const key of Object.keys(patch)) {
    recentLocalWrites.set(key, expiry);
  }
}

function filterEchoedPatch(patch: ConfigPatch): ConfigPatch {
  const now = Date.now();
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(patch)) {
    const expiry = recentLocalWrites.get(key);
    if (expiry !== undefined) {
      if (now < expiry) {
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

function schedulePatchFlush(
  set: (partial: Partial<ConfigStore>) => void,
  get: () => ConfigStore,
) {
  if (networkFlushTimer) return;
  if (typeof setTimeout === 'function') {
    networkFlushTimer = setTimeout(() => {
      networkFlushTimer = null;
      void (async () => {
        const toSend = pendingPatch;
        pendingPatch = {};
        if (Object.keys(toSend).length === 0) return;
        try {
          const res = await fetch('/api/config', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(toSend),
          });
          if (!res.ok) {
            throw new Error(`PATCH /api/config -> ${res.status}`);
          }
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
          void get().hydrate();
        }
      })();
    }, PATCH_SEND_DEBOUNCE_MS);
  } else {
    const toSend = pendingPatch;
    pendingPatch = {};
    if (Object.keys(toSend).length === 0) return;
    void (async () => {
      try {
        const res = await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(toSend),
        });
        if (!res.ok) {
          throw new Error(`PATCH /api/config -> ${res.status}`);
        }
      } catch (err) {
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

      const config = (await configRes.json()) as Config;
      const streamerbot = streamerbotRes.ok
        ? (await streamerbotRes.json()) as StreamerbotStatus
        : {
          connected: false,
          error: `GET /api/streamerbot/status -> ${streamerbotRes.status}`,
        };

      set({
        config,
        hydrated: true,
        lastError: null,
        streamerbot,
      });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  async patch(patch) {
    // Apply optimistically so the UI (sliders, preview) reacts this frame.
    set((state) => ({ config: { ...state.config, ...patch } }));
    // Record which keys this client has just written so the WS broadcast
    // echo for these fields gets filtered out until the user stops
    // dragging.
    markLocalWrites(patch);
    // Merge into the pending buffer and schedule a single rAF-coalesced
    // network flush. Later keys in the same drag naturally overwrite earlier
    // ones via Object.assign.
    Object.assign(pendingPatch, patch);
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
      set({ config: msg.config, hydrated: true });
      return;
    case 'config:update': {
      // Strip out keys this client wrote recently — those echoes were
      // overwriting the live local value mid-drag (see comment on
      // `recentLocalWrites` in useConfigStore). Remote-sourced updates
      // (streamer.bot, preset apply) aren't in our local-writes map and
      // pass through unfiltered, so they still land immediately.
      const filtered = filterEchoedPatch(msg.patch);
      if (Object.keys(filtered).length === 0) return;
      set((state) => ({ config: { ...state.config, ...filtered } }));
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
