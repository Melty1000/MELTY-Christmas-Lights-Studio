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
let flushScheduled = false;

function schedulePatchFlush(
  set: (partial: Partial<ConfigStore>) => void,
  get: () => ConfigStore,
) {
  if (flushScheduled) return;
  flushScheduled = true;

  const flush = async () => {
    flushScheduled = false;
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
  };

  // Prefer rAF so the flush runs right after React commits the optimistic
  // state. Fall back to a microtask-ish timeout for non-browser contexts
  // (tests, SSR) where rAF isn't available.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => void flush());
  } else {
    setTimeout(() => void flush(), 0);
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
    case 'config:update':
      set((state) => ({ config: { ...state.config, ...msg.patch } }));
      return;
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
