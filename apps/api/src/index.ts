import type { Server as HttpServer } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { initConfigStore } from './config/store.js';
import { initPresetStore } from './presets/store.js';
import { configRoutes } from './routes/config.js';
import { presetRoutes } from './routes/presets.js';
import { streamerbotRoutes } from './routes/streamerbot.js';
import { attachWebSocket } from './ws/server.js';
import {
  getStreamerbotUrl,
  initStreamerbotClient,
  isStreamerbotConnected,
} from './streamerbot/client.js';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  await initConfigStore();
  await initPresetStore();

  const app = new Hono();
  app.use('*', logger());
  app.use('*', cors());

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      streamerbot: { connected: isStreamerbotConnected(), url: getStreamerbotUrl() },
    }),
  );

  app.route('/api/config', configRoutes);
  app.route('/api/presets', presetRoutes);
  app.route('/api/streamerbot', streamerbotRoutes);

  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
  });

  attachWebSocket(server as unknown as HttpServer);
  initStreamerbotClient();
}

main().catch((err) => {
  console.error('[api] fatal', err);
  process.exit(1);
});
