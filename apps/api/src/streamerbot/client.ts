import { StreamerbotClient } from '@streamerbot/client';
import { broadcast } from '../ws/server.js';

const SB_HOST = process.env.STREAMERBOT_HOST ?? '127.0.0.1';
const SB_PORT = Number(process.env.STREAMERBOT_PORT ?? 8080);
const SB_ENDPOINT = process.env.STREAMERBOT_ENDPOINT ?? '/';
const SB_URL = `ws://${SB_HOST}:${SB_PORT}${SB_ENDPOINT}`;

let client: StreamerbotClient | null = null;
let connected = false;

export function initStreamerbotClient(): void {
  if (process.env.DISABLE_STREAMERBOT === '1') {
    console.log('[streamerbot] disabled via DISABLE_STREAMERBOT=1');
    broadcast({ type: 'streamerbot:status', connected: false, url: SB_URL });
    return;
  }

  client = new StreamerbotClient({
    host: SB_HOST,
    port: SB_PORT,
    endpoint: SB_ENDPOINT,
    autoReconnect: true,
    retries: -1,
    subscribe: '*',
    onConnect: () => {
      connected = true;
      console.log(`[streamerbot] connected to ${SB_URL}`);
      broadcast({ type: 'streamerbot:status', connected: true, url: SB_URL });
    },
    onDisconnect: () => {
      connected = false;
      console.log('[streamerbot] disconnected');
      broadcast({ type: 'streamerbot:status', connected: false, url: SB_URL });
    },
    onError: (err: unknown) => {
      console.warn('[streamerbot] error', err);
      broadcast({
        type: 'streamerbot:status',
        connected: false,
        url: SB_URL,
        error: err instanceof Error ? err.message : String(err),
      });
    },
    onData: (payload: { event?: { source: string; type: string }; data?: unknown }) => {
      if (payload.event) {
        broadcast({
          type: 'streamerbot:event',
          event: `${payload.event.source}.${payload.event.type}`,
          data: payload.data,
        });
      }
    },
  });
}

export function isStreamerbotConnected(): boolean {
  return connected;
}

export function getStreamerbotUrl(): string {
  return SB_URL;
}

export function getStreamerbotClient(): StreamerbotClient | null {
  return client;
}
