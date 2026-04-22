import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  type WsServerMessage,
  wsClientMessageSchema,
} from '@melty/shared';
import { applyPatch, getConfig, onConfigChange } from '../config/store.js';

const clients = new Set<WebSocket>();

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      send(ws, { type: 'config:snapshot', config: getConfig() });

      ws.on('message', (raw) => {
        try {
          const parsed = wsClientMessageSchema.parse(JSON.parse(String(raw)));
          if (parsed.type === 'config:patch') {
            applyPatch(parsed.patch, 'ws');
          }
        } catch {
          send(ws, { type: 'error', message: 'invalid_message' });
        }
      });

      ws.on('close', () => clients.delete(ws));
      ws.on('error', () => clients.delete(ws));
    });
  });

  onConfigChange((patch, source) => {
    broadcast({
      type: 'config:update',
      patch,
      source: sourceToEnum(source),
    });
  });
}

export function broadcast(msg: WsServerMessage): void {
  for (const ws of clients) send(ws, msg);
}

function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sourceToEnum(
  source: string,
): 'ui' | 'streamerbot' | 'preset' | 'api' {
  if (source === 'ui' || source === 'streamerbot' || source === 'preset') return source;
  return 'api';
}
