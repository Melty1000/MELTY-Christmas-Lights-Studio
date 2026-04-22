import { z } from 'zod';
import { configPatchSchema } from './config.js';

export const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  builtIn: z.boolean().default(false),
  config: configPatchSchema,
  createdAt: z.string().datetime().optional(),
});

export type Preset = z.infer<typeof presetSchema>;
