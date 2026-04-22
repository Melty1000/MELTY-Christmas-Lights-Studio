import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { presetSchema } from '@melty/shared';
import {
  deletePreset,
  getPreset,
  listPresets,
  upsertPreset,
} from '../presets/store.js';
import { applyPatch } from '../config/store.js';

export const presetRoutes = new Hono();

presetRoutes.get('/', (c) => c.json(listPresets()));

presetRoutes.get('/:id', (c) => {
  const preset = getPreset(c.req.param('id'));
  if (!preset) return c.json({ error: 'not_found' }, 404);
  return c.json(preset);
});

presetRoutes.put(
  '/:id',
  zValidator('json', presetSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    if (body.id !== id) {
      return c.json({ error: 'id_mismatch' }, 400);
    }
    try {
      const saved = await upsertPreset(body);
      return c.json(saved);
    } catch (err) {
      return c.json(
        { error: 'upsert_failed', message: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  },
);

presetRoutes.delete('/:id', async (c) => {
  try {
    const ok = await deletePreset(c.req.param('id'));
    return c.json({ deleted: ok });
  } catch (err) {
    return c.json(
      { error: 'delete_failed', message: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});

presetRoutes.post('/:id/apply', (c) => {
  const preset = getPreset(c.req.param('id'));
  if (!preset) return c.json({ error: 'not_found' }, 404);
  const next = applyPatch(preset.config, 'preset');
  return c.json(next);
});
