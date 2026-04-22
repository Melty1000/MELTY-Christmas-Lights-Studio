import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  configSchema,
  type Config,
  type ConfigPatch,
} from '@melty/shared';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

type Listener = (patch: ConfigPatch, source: string) => void;

let current: Config = { ...DEFAULT_CONFIG };
let saveTimer: NodeJS.Timeout | null = null;
const listeners = new Set<Listener>();

export async function initConfigStore(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = await readFile(CONFIG_PATH, 'utf8');
      const parsed = configSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        current = parsed.data;
        console.log('[config] loaded from disk');
      } else {
        console.warn('[config] invalid config.json — using defaults', parsed.error.flatten());
      }
    } catch (err) {
      console.warn('[config] failed to read config.json', err);
    }
  } else {
    await persist();
    console.log('[config] created default config.json');
  }
}

export function getConfig(): Config {
  return current;
}

export function applyPatch(patch: ConfigPatch, source: string = 'api'): Config {
  current = { ...current, ...patch };
  scheduleSave();
  for (const listener of listeners) listener(patch, source);
  return current;
}

export function resetConfig(source: string = 'api'): Config {
  current = { ...DEFAULT_CONFIG };
  scheduleSave();
  for (const listener of listeners) listener(current, source);
  return current;
}

export function onConfigChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persist();
  }, 250);
}

async function persist(): Promise<void> {
  try {
    await writeFile(CONFIG_PATH, JSON.stringify(current, null, 2), 'utf8');
  } catch (err) {
    console.error('[config] save failed', err);
  }
}
