import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getStreamerbotClient,
  getStreamerbotUrl,
  isStreamerbotConnected,
} from '../streamerbot/client.js';

const triggerBodySchema = z.object({
  args: z.record(z.string(), z.unknown()).optional(),
});

export const streamerbotRoutes = new Hono();

streamerbotRoutes.get('/status', (c) =>
  c.json({
    connected: isStreamerbotConnected(),
    url: getStreamerbotUrl(),
  }),
);

streamerbotRoutes.get('/actions', async (c) => {
  const client = getStreamerbotClient();
  if (!client) {
    return c.json({ error: 'streamerbot_disabled' }, 503);
  }
  if (!isStreamerbotConnected()) {
    return c.json({ error: 'streamerbot_disconnected' }, 503);
  }
  try {
    const result = await client.getActions();
    return c.json(result);
  } catch (err) {
    return c.json(
      { error: 'sb_error', message: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});

streamerbotRoutes.post(
  '/trigger/:id',
  zValidator('json', triggerBodySchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_body', details: result.error.flatten() }, 400);
    }
    return undefined;
  }),
  async (c) => {
    const client = getStreamerbotClient();
    if (!client) {
      return c.json({ error: 'streamerbot_disabled' }, 503);
    }
    if (!isStreamerbotConnected()) {
      return c.json({ error: 'streamerbot_disconnected' }, 503);
    }
    const id = c.req.param('id');
    const body = c.req.valid('json');
    try {
      const result = await client.doAction(id, body.args ?? {});
      return c.json(result);
    } catch (err) {
      return c.json(
        { error: 'trigger_failed', message: err instanceof Error ? err.message : String(err) },
        502,
      );
    }
  },
);
