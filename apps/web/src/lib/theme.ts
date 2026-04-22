export const MELT_THEME_OPTIONS = [
  {
    value: 'graphite-gold',
    label: 'Graphite Gold',
    detail: 'Default MELTY look with the industrial amber accent.',
  },
  {
    value: 'graphite-cobalt',
    label: 'Graphite Cobalt',
    detail: 'Cooler SB-style variant with a steel-blue accent.',
  },
  {
    value: 'slate-gold',
    label: 'Slate Gold',
    detail: 'Softer frame and brighter gold for presentation mode.',
  },
  {
    value: 'slate-cobalt',
    label: 'Slate Cobalt',
    detail: 'The calmest and most technical of the four presets.',
  },
] as const;

export type MeltTheme = (typeof MELT_THEME_OPTIONS)[number]['value'];

const STORAGE_KEY = 'melt-theme';
const DEFAULT_THEME: MeltTheme = 'graphite-gold';

export function getStoredMeltTheme(): MeltTheme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && MELT_THEME_OPTIONS.some((theme) => theme.value === stored)) {
    return stored as MeltTheme;
  }
  return DEFAULT_THEME;
}

export function applyMeltTheme(theme: MeltTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
}

export function loadMeltTheme() {
  applyMeltTheme(getStoredMeltTheme());
}
