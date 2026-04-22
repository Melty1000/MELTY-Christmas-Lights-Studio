import { z } from 'zod';
import { configSchema, configPatchSchema } from './config.js';

export const wsServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('config:snapshot'),
    config: configSchema,
  }),
  z.object({
    type: z.literal('config:update'),
    patch: configPatchSchema,
    source: z.enum(['ui', 'streamerbot', 'preset', 'api']).default('api'),
  }),
  z.object({
    type: z.literal('streamerbot:status'),
    connected: z.boolean(),
    url: z.string().optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('streamerbot:event'),
    event: z.string(),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
  }),
]);

export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ping'),
  }),
  z.object({
    type: z.literal('config:patch'),
    patch: configPatchSchema,
  }),
]);

export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
