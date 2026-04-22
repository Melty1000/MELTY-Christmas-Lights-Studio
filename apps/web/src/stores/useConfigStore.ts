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
    set((state) => ({ config: { ...state.config, ...patch } }));
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error(`PATCH /api/config -> ${res.status}`);
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
      void get().hydrate();
    }
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
