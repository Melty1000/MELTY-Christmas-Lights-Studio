import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { configPatchSchema } from '@melty/shared';
import { applyPatch, getConfig, resetConfig } from '../config/store.js';

export const configRoutes = new Hono();

configRoutes.get('/', (c) => c.json(getConfig()));

configRoutes.patch(
  '/',
  zValidator('json', configPatchSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: 'invalid_patch', details: result.error.flatten() },
        400,
      );
    }
    return undefined;
  }),
  (c) => {
    const patch = c.req.valid('json');
    const source = c.req.query('source') ?? 'ui';
    const next = applyPatch(patch, source);
    return c.json(next);
  },
);

configRoutes.post('/reset', (c) => {
  const next = resetConfig('api');
  return c.json(next);
});
