import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { type Preset, presetSchema } from '@melty/shared';
import { z } from 'zod';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PRESETS_PATH = path.join(DATA_DIR, 'presets.json');

const presetsFileSchema = z.array(presetSchema);

let presets: Preset[] = [];

export async function initPresetStore(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  if (existsSync(PRESETS_PATH)) {
    try {
      const raw = await readFile(PRESETS_PATH, 'utf8');
      const parsed = presetsFileSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        presets = parsed.data;
        console.log(`[presets] loaded ${presets.length} presets from disk`);
      } else {
        console.warn('[presets] invalid presets.json — starting empty', parsed.error.flatten());
      }
    } catch (err) {
      console.warn('[presets] failed to read presets.json', err);
    }
  } else {
    await persist();
  }
}

export function listPresets(): Preset[] {
  return presets;
}

export function getPreset(id: string): Preset | undefined {
  return presets.find((p) => p.id === id);
}

export async function upsertPreset(preset: Preset): Promise<Preset> {
  const idx = presets.findIndex((p) => p.id === preset.id);
  if (idx >= 0) {
    if (presets[idx]!.builtIn) {
      throw new Error(`Preset "${preset.id}" is built-in and cannot be overwritten`);
    }
    presets[idx] = preset;
  } else {
    presets.push(preset);
  }
  await persist();
  return preset;
}

export async function deletePreset(id: string): Promise<boolean> {
  const idx = presets.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  if (presets[idx]!.builtIn) {
    throw new Error(`Preset "${id}" is built-in and cannot be deleted`);
  }
  presets.splice(idx, 1);
  await persist();
  return true;
}

async function persist(): Promise<void> {
  try {
    await writeFile(PRESETS_PATH, JSON.stringify(presets, null, 2), 'utf8');
  } catch (err) {
    console.error('[presets] save failed', err);
  }
}
