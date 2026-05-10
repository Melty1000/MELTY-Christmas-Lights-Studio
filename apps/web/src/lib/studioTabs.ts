export type StudioTabId = 'layout' | 'theme' | 'lighting' | 'motion' | 'environment' | 'presets';

export interface StudioTabRoute {
  id: StudioTabId;
  label: string;
  path: string;
  to: string;
}

export const STUDIO_TABS: StudioTabRoute[] = [
  { id: 'layout', label: 'Layout', path: '', to: '/' },
  { id: 'theme', label: 'Theme', path: 'theme', to: '/theme' },
  { id: 'lighting', label: 'Lighting', path: 'lighting', to: '/lighting' },
  { id: 'motion', label: 'Motion', path: 'motion', to: '/motion' },
  { id: 'environment', label: 'Environment', path: 'environment', to: '/environment' },
  { id: 'presets', label: 'Presets', path: 'presets', to: '/presets' },
];

export function studioTabIdFromPath(pathname: string): StudioTabId {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return STUDIO_TABS.find((tab) => tab.to === normalized)?.id ?? 'layout';
}
