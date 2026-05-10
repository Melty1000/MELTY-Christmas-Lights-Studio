import {
  DEFAULT_CONFIG,
  ambientIntensityFromControlValue,
  ambientIntensityToControlValue,
  bulbScaleFromControlValue,
  bulbScaleToControlValue,
  glassOpacityFromControlValue,
  glassOpacityToControlValue,
  reflectionIntensityFromControlValue,
  reflectionIntensityToControlValue,
  wireSeparationFromControlValue,
  wireSeparationToControlValue,
  wireThicknessFromControlValue,
  wireThicknessToControlValue,
  wireTwistsFromControlValue,
  wireTwistsToControlValue,
  wireWeightFromControlValue,
  wireWeightToControlValue,
  type Config,
  type ConfigPatch,
} from './config.js';

export const USER_SLIDER_MIN = 0;
export const USER_SLIDER_MAX = 100;
export const USER_SLIDER_STEP = 1;

export interface SliderControlSpec {
  label: string;
  dependencies: readonly (keyof Config)[];
  toDisplay: (config: Config) => number;
  fromDisplay: (display: number, config: Config) => ConfigPatch;
}

type NumericConfigKey = {
  [K in keyof Config]: Config[K] extends number ? K : never
}[keyof Config];

interface LinearFieldOptions {
  min: number;
  max: number;
  decimals?: number;
  integer?: boolean;
}

function linearField<K extends NumericConfigKey>(
  field: K,
  label: string,
  options: LinearFieldOptions,
): SliderControlSpec {
  return {
    label,
    dependencies: [field],
    toDisplay: (config) => rawToDisplay(config[field] as number, options.min, options.max),
    fromDisplay: (display) => ({
      [field]: displayToRaw(display, options),
    } as ConfigPatch),
  };
}

function customField(
  label: string,
  dependencies: readonly (keyof Config)[],
  toDisplay: SliderControlSpec['toDisplay'],
  fromDisplay: SliderControlSpec['fromDisplay'],
): SliderControlSpec {
  return { label, dependencies, toDisplay, fromDisplay };
}

export const SLIDER_CONTROL_SPECS = {
  SPANS: customField(
    'Spans',
    ['NUM_PINS'],
    (config) => rawToDisplay(Math.max(1, config.NUM_PINS - 1), 1, 19),
    (display) => ({ NUM_PINS: displayToRaw(display, { min: 1, max: 19, integer: true }) + 1 }),
  ),
  LIGHTS_PER_SEGMENT: linearField('LIGHTS_PER_SEGMENT', 'Lights / span', {
    min: 1,
    max: 100,
    integer: true,
  }),
  SAG_AMPLITUDE: linearField('SAG_AMPLITUDE', 'Sag', { min: 0, max: 2, decimals: 2 }),
  BULB_SCALE: customField(
    'Bulb size',
    ['BULB_SCALE'],
    (config) => bulbScaleToControlValue(config.BULB_SCALE),
    (display) => ({ BULB_SCALE: bulbScaleFromControlValue(display) }),
  ),
  WIRE_WEIGHT: customField(
    'Wire Weight',
    ['WIRE_WEIGHT'],
    (config) => wireWeightToControlValue(config.WIRE_WEIGHT),
    (display) => ({
      WIRE_TUNING_MODE: 'SIMPLE',
      WIRE_WEIGHT: wireWeightFromControlValue(display),
    }),
  ),
  TWIST_DENSITY: customField(
    'Twist Density',
    ['TWIST_DENSITY'],
    (config) => clampDisplay(config.TWIST_DENSITY),
    (display) => ({
      WIRE_TUNING_MODE: 'SIMPLE',
      TWIST_DENSITY: clampDisplay(display),
    }),
  ),
  LAYOUT_CORNER_ROUNDNESS: linearField('LAYOUT_CORNER_ROUNDNESS', 'Corner Roundness', {
    min: 0,
    max: 1,
    decimals: 2,
  }),
  EDGE_INSET: linearField('EDGE_INSET', 'Edge inset', { min: 0, max: 0.35, decimals: 3 }),
  EDGE_COVERAGE: linearField('EDGE_COVERAGE', 'Edge coverage', { min: 0.2, max: 1.5, decimals: 2 }),
  SHAPE_PADDING: linearField('SHAPE_PADDING', 'Shape padding', { min: 0, max: 0.35, decimals: 3 }),
  LAYOUT_POSITION_X: linearField('LAYOUT_POSITION_X', 'Position X', { min: -1, max: 1, decimals: 2 }),
  LAYOUT_POSITION_Y: linearField('LAYOUT_POSITION_Y', 'Position Y', { min: -1, max: 1, decimals: 2 }),

  CAMERA_DISTANCE: linearField('CAMERA_DISTANCE', 'Distance', { min: 1, max: 200, decimals: 1 }),
  CAMERA_HEIGHT: linearField('CAMERA_HEIGHT', 'Target offset (Y)', { min: -50, max: 50, decimals: 1 }),
  CAMERA_X: linearField('CAMERA_X', 'Target offset (X)', { min: -50, max: 50, decimals: 1 }),

  AMBIENT_INTENSITY: customField(
    'Ambient',
    ['AMBIENT_INTENSITY'],
    (config) => ambientIntensityToControlValue(config.AMBIENT_INTENSITY),
    (display) => ({ AMBIENT_INTENSITY: ambientIntensityFromControlValue(display) }),
  ),
  GLASS_OPACITY: customField(
    'Glass opacity',
    ['GLASS_OPACITY'],
    (config) => glassOpacityToControlValue(config.GLASS_OPACITY),
    (display) => ({ GLASS_OPACITY: glassOpacityFromControlValue(display) }),
  ),
  GLASS_ROUGHNESS: linearField('GLASS_ROUGHNESS', 'Glass roughness', { min: 0, max: 1, decimals: 2 }),
  REFLECTION_INTENSITY: customField(
    'Reflection strength',
    ['REFLECTION_INTENSITY'],
    (config) => reflectionIntensityToControlValue(config.REFLECTION_INTENSITY),
    (display) => ({ REFLECTION_INTENSITY: reflectionIntensityFromControlValue(display) }),
  ),
  BULB_INTERNAL_GLOW: linearField('BULB_INTERNAL_GLOW', 'Bulb internal glow', {
    min: 0,
    max: 800,
    integer: true,
  }),
  HALO_SOURCE_INTENSITY: linearField('HALO_SOURCE_INTENSITY', 'Halo source', { min: 0, max: 20, decimals: 2 }),
  HALO_STRENGTH: linearField('HALO_STRENGTH', 'Strength', { min: 0, max: 5, decimals: 2 }),
  HALO_RADIUS: linearField('HALO_RADIUS', 'Radius', { min: 0, max: 0.3, decimals: 3 }),
  HALO_INTENSITY: linearField('HALO_INTENSITY', 'Halo intensity', { min: 0, max: 5, decimals: 2 }),

  ANIMATION_SPEED: linearField('ANIMATION_SPEED', 'Animation speed', { min: 0, max: 5, decimals: 2 }),
  SWAY_X: linearField('SWAY_X', 'Sway X', { min: 0, max: 2, decimals: 2 }),
  SWAY_Z: linearField('SWAY_Z', 'Sway Z', { min: 0, max: 2, decimals: 2 }),

  TWINKLE_SPEED: linearField('TWINKLE_SPEED', 'Twinkle speed', { min: 0, max: 4, decimals: 2 }),
  TWINKLE_MIN_INTENSITY: linearField('TWINKLE_MIN_INTENSITY', 'Min intensity', { min: 0, max: 1, decimals: 2 }),
  TWINKLE_MAX_INTENSITY: linearField('TWINKLE_MAX_INTENSITY', 'Max intensity', { min: 0, max: 1, decimals: 2 }),
  TWINKLE_RANDOMNESS: linearField('TWINKLE_RANDOMNESS', 'Randomness', { min: 0, max: 1, decimals: 2 }),

  SNOW_COUNT: linearField('SNOW_COUNT', 'Count', { min: 0, max: 2000, integer: true }),
  SNOW_SPEED: linearField('SNOW_SPEED', 'Speed', { min: 0, max: 0.1, decimals: 3 }),
  SNOW_SIZE: linearField('SNOW_SIZE', 'Size', { min: 0, max: 0.5, decimals: 3 }),
  SNOW_DRIFT: linearField('SNOW_DRIFT', 'Drift', { min: -1, max: 1, decimals: 2 }),

  STARS_COUNT: linearField('STARS_COUNT', 'Count', { min: 0, max: 2000, integer: true }),
  STARS_SIZE: linearField('STARS_SIZE', 'Size', { min: 0, max: 1, decimals: 2 }),
  STARS_OPACITY: linearField('STARS_OPACITY', 'Opacity', { min: 0, max: 1, decimals: 2 }),
  STARS_TWINKLE_SPEED: linearField('STARS_TWINKLE_SPEED', 'Twinkle speed', { min: 0, max: 5, decimals: 2 }),

  ADVANCED_WIRE_THICKNESS: customField(
    'Thickness',
    ['ADVANCED_WIRE_THICKNESS'],
    (config) => wireThicknessToControlValue(config.ADVANCED_WIRE_THICKNESS),
    (display) => ({
      WIRE_TUNING_MODE: 'ADVANCED',
      ADVANCED_WIRE_THICKNESS: wireThicknessFromControlValue(display),
    }),
  ),
  ADVANCED_WIRE_SEPARATION: customField(
    'Separation',
    ['ADVANCED_WIRE_THICKNESS', 'ADVANCED_WIRE_SEPARATION', 'ADVANCED_WIRE_TWISTS'],
    (config) => wireSeparationToControlValue(
      config.ADVANCED_WIRE_SEPARATION,
      config.ADVANCED_WIRE_THICKNESS,
      config.ADVANCED_WIRE_TWISTS,
    ),
    (display, config) => ({
      WIRE_TUNING_MODE: 'ADVANCED',
      ADVANCED_WIRE_SEPARATION: wireSeparationFromControlValue(
        display,
        config.ADVANCED_WIRE_THICKNESS,
        config.ADVANCED_WIRE_TWISTS,
      ),
    }),
  ),
  ADVANCED_WIRE_TWISTS: customField(
    'Twists',
    ['ADVANCED_WIRE_THICKNESS', 'ADVANCED_WIRE_SEPARATION', 'ADVANCED_WIRE_TWISTS'],
    (config) => wireTwistsToControlValue(
      config.ADVANCED_WIRE_TWISTS,
      config.ADVANCED_WIRE_THICKNESS,
      config.ADVANCED_WIRE_SEPARATION,
    ),
    (display, config) => ({
      WIRE_TUNING_MODE: 'ADVANCED',
      ADVANCED_WIRE_TWISTS: wireTwistsFromControlValue(
        display,
        config.ADVANCED_WIRE_THICKNESS,
        config.ADVANCED_WIRE_SEPARATION,
      ),
    }),
  ),
} as const satisfies Record<string, SliderControlSpec>;

export type SliderControlId = keyof typeof SLIDER_CONTROL_SPECS;

export const SLIDER_CONTROL_IDS = Object.keys(SLIDER_CONTROL_SPECS) as SliderControlId[];

export function sliderDisplayValue(id: SliderControlId, config: Config = DEFAULT_CONFIG): number {
  return clampDisplay(SLIDER_CONTROL_SPECS[id].toDisplay(config));
}

export function sliderPatchFromDisplay(
  id: SliderControlId,
  display: number,
  config: Config = DEFAULT_CONFIG,
): ConfigPatch {
  return SLIDER_CONTROL_SPECS[id].fromDisplay(clampDisplay(display), config);
}

export function sliderLabel(id: SliderControlId): string {
  return SLIDER_CONTROL_SPECS[id].label;
}

function rawToDisplay(raw: number, min: number, max: number): number {
  if (max <= min) return USER_SLIDER_MIN;
  const normalized = ((clampFinite(raw, min, max, min) - min) / (max - min)) * USER_SLIDER_MAX;
  return clampDisplay(normalized);
}

function displayToRaw(display: number, options: LinearFieldOptions): number {
  const normalized = clampDisplay(display) / USER_SLIDER_MAX;
  const raw = options.min + normalized * (options.max - options.min);
  if (options.integer) return Math.round(raw);
  if (options.decimals !== undefined) return Number(raw.toFixed(options.decimals));
  return raw;
}

function clampDisplay(value: number): number {
  return Math.round(clampFinite(value, USER_SLIDER_MIN, USER_SLIDER_MAX, USER_SLIDER_MIN));
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numberValue));
}
