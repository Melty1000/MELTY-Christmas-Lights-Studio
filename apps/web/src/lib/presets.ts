import { presetSchema, type Config, type Preset } from '@melty/shared';

export async function fetchPresets(): Promise<Preset[]> {
  const res = await fetch('/api/presets');
  if (!res.ok) {
    throw new Error(`GET /api/presets -> ${res.status}`);
  }
  return (await res.json()) as Preset[];
}

export async function savePreset(preset: Preset): Promise<Preset> {
  const res = await fetch(`/api/presets/${encodeURIComponent(preset.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(preset),
  });
  if (!res.ok) {
    const body = await tryReadError(res);
    throw new Error(body ?? `PUT /api/presets/${preset.id} -> ${res.status}`);
  }
  return (await res.json()) as Preset;
}

export async function applyPreset(id: string): Promise<Config> {
  const res = await fetch(`/api/presets/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await tryReadError(res);
    throw new Error(body ?? `POST /api/presets/${id}/apply -> ${res.status}`);
  }
  return (await res.json()) as Config;
}

export async function removePreset(id: string): Promise<void> {
  const res = await fetch(`/api/presets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await tryReadError(res);
    throw new Error(body ?? `DELETE /api/presets/${id} -> ${res.status}`);
  }
}

export function buildPreset(name: string, id: string, config: Config, builtIn = false): Preset {
  return presetSchema.parse({
    id,
    name,
    builtIn,
    config,
    createdAt: new Date().toISOString(),
  });
}

export function exportPresetFile(preset: Preset): void {
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${preset.id || 'melty-preset'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importPresetFile(file: File): Promise<Preset> {
  const text = await file.text();
  return presetSchema.parse(JSON.parse(text));
}

export function slugifyPresetId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function tryReadError(res: Response): Promise<string | null> {
  try {
    const body = await res.json() as { message?: string; error?: string };
    return body.message ?? body.error ?? null;
  } catch {
    return null;
  }
}
