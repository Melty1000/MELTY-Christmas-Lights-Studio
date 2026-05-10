import { z } from 'zod';

export const ANIMATION_STYLES = [
  'STATIC',
  'SOFT_TWINKLE',
  'ALTERNATING',
  'CHASE',
  'RANDOM_SPARKLE',
  'COLOR_FADE',
  'PARTY',
] as const;

export const THEME_NAMES = [
  'CANDY_CANE', 'CHRISTMAS', 'CLASSIC', 'CYBERPUNK', 'FANTASY', 'FIRE',
  'FOREST', 'GHOST', 'GOLD_RUSH', 'HALLOWEEN', 'ICY', 'LAVENDER', 'MINT',
  'OCEAN', 'PASTEL_DREAM', 'PEACH', 'RAINBOW', 'ROYAL', 'TROPICAL',
  'VAPORWAVE', 'VINTAGE', 'WARM_SUNSET',
] as const;

export const WIRE_THEME_NAMES = [
  'BLACK', 'CANDY_CANE', 'CHRISTMAS', 'COPPER', 'FIRE', 'FOREST', 'GOLD',
  'HALLOWEEN', 'ICY', 'MINT', 'OCEAN', 'ORANGE', 'PINK', 'PURPLE',
  'SILVER', 'TEAL', 'WHITE', 'YELLOW',
] as const;

export const SOCKET_THEME_NAMES = ['WIRE_MATCH', 'GOLD', 'SILVER', 'COPPER'] as const;

export const LAYOUT_MODE_NAMES = ['EDGES', 'SHAPE'] as const;

export const LAYOUT_EDGE_NAMES = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'] as const;

export const BULB_ORIENTATION_MODE_NAMES = ['LAYOUT', 'NATURAL'] as const;

export const WIRE_TUNING_MODE_NAMES = ['SIMPLE', 'ADVANCED'] as const;

export const WIRE_CONTROL_LIMITS = {
  THICKNESS_MIN: 0.01,
  THICKNESS_MAX: 0.2,
  SEPARATION_MIN: 0,
  SEPARATION_MAX: 0.3,
  TWISTS_MIN: 0,
  TWISTS_MAX: 200,
  ZERO_SEPARATION_SAFE_PRODUCT: 3.2,
  TWIST_SEPARATION_GAIN: 8.37,
  TWIST_THICKNESS_DRAG: 50.9,
  CENTERLINE_CLEARANCE_RATIO: 0.9,
  CENTERLINE_CLEARANCE_BASE: 0.002,
  THIN_WIRE_SEPARATION_FADE_END: 0.048,
  THIN_WIRE_SEPARATION_MIN_LOW_TWIST: 0.006,
  THIN_WIRE_SEPARATION_MIN_HIGH_TWIST: 0.009,
  THIN_WIRE_SEPARATION_MAX_LOW_TWIST: 0.06,
  THIN_WIRE_SEPARATION_MAX_HIGH_TWIST: 0.036,
} as const;

const WIRE_CONTROL_PERCENT_MIN = 0;
const WIRE_CONTROL_PERCENT_MAX = 100;

export const WIRE_SIMPLE_WEIGHT_MAX = 50;
export const WIRE_SIMPLE_WEIGHT_CONTROL_MAX = WIRE_CONTROL_PERCENT_MAX;
export const BULB_SCALE_CONTROL_MIN = WIRE_CONTROL_PERCENT_MIN;
export const BULB_SCALE_CONTROL_MAX = WIRE_CONTROL_PERCENT_MAX;
export const AMBIENT_INTENSITY_CONTROL_MIN = WIRE_CONTROL_PERCENT_MIN;
export const AMBIENT_INTENSITY_CONTROL_MAX = WIRE_CONTROL_PERCENT_MAX;
export const REFLECTION_INTENSITY_CONTROL_MIN = WIRE_CONTROL_PERCENT_MIN;
export const REFLECTION_INTENSITY_CONTROL_MAX = WIRE_CONTROL_PERCENT_MAX;
export const GLASS_OPACITY_CONTROL_MIN = WIRE_CONTROL_PERCENT_MIN;
export const GLASS_OPACITY_CONTROL_MAX = WIRE_CONTROL_PERCENT_MAX;

export const DEFAULT_WIRE_GEOMETRY = {
  WIRE_THICKNESS: 0.031,
  WIRE_SEPARATION: 0.036,
  WIRE_TWISTS: 200,
} as const;

export const BULB_SCALE_LIMITS = {
  MIN: 0.1,
  MAX: 0.5,
} as const;

export const AMBIENT_INTENSITY_LIMITS = {
  MIN: 0,
  MAX: 1,
} as const;

export const REFLECTION_INTENSITY_LIMITS = {
  MIN: 0,
  MAX: 2.4,
} as const;

export const GLASS_OPACITY_LIMITS = {
  MIN: 0.02,
  MAX: 0.9,
} as const;

const WIRE_CONTROL_ENDPOINT_EPSILON = 0.0011;
const WIRE_SIMPLE_SPACING_RATIO = 0.03;

export const configSchema = z.object({
  ANIMATION_STYLE: z.enum(ANIMATION_STYLES).default('SOFT_TWINKLE'),

  STARS_ENABLED: z.boolean().default(false),
  SNOW_ENABLED: z.boolean().default(false),
  BACKGROUND_ENABLED: z.boolean().default(false),
  REFLECTION_INTENSITY: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.min(REFLECTION_INTENSITY_LIMITS.MAX, Math.max(REFLECTION_INTENSITY_LIMITS.MIN, v))
      : v),
    z.number().min(REFLECTION_INTENSITY_LIMITS.MIN).max(REFLECTION_INTENSITY_LIMITS.MAX),
  ).default(1),
  ANTIALIAS_ENABLED: z.boolean().default(true),
  STATS_ENABLED: z.boolean().default(false),

  ACTIVE_THEME: z.enum(THEME_NAMES).default('GHOST'),
  WIRE_THEME: z.enum(WIRE_THEME_NAMES).default('SILVER'),
  SOCKET_THEME: z.enum(SOCKET_THEME_NAMES).default('WIRE_MATCH'),

  LAYOUT_MODE: z.preprocess(
    (v) => (v === 'SHAPE' ? 'SHAPE' : 'EDGES'),
    z.enum(LAYOUT_MODE_NAMES),
  ).default('EDGES'),
  LAYOUT_EDGES: z.array(z.enum(LAYOUT_EDGE_NAMES)).min(1).default(['TOP']),
  LAYOUT_SHAPE_SIDES: z.preprocess(
    (v) => (typeof v === 'number' ? Math.round(Math.min(10, Math.max(3, v))) : v),
    z.number().int().min(3).max(10),
  ).default(4),
  LAYOUT_CORNER_ROUNDNESS: z.preprocess(
    (v) => {
      if (typeof v !== 'number') return v;
      const clamped = Math.min(1, Math.max(0, v));
      return Number((Math.round(clamped * 100) / 100).toFixed(2));
    },
    z.number().min(0).max(1),
  ).default(0),
  EDGE_INSET: z.number().min(0).max(0.35).default(0),
  EDGE_COVERAGE: z.number().min(0.2).max(1.5).default(1),
  SHAPE_PADDING: z.number().min(0).max(0.35).default(0),
  LAYOUT_POSITION_X: z.number().min(-1).max(1).default(0),
  LAYOUT_POSITION_Y: z.number().min(-1).max(1).default(0),

  BULB_ORIENTATION_MODE: z.enum(BULB_ORIENTATION_MODE_NAMES).default('LAYOUT'),
  NUM_PINS: z.number().int().min(2).max(20).default(7),
  SAG_AMPLITUDE: z.number().min(0).max(2).default(0.4),
  LIGHTS_PER_SEGMENT: z.number().int().min(1).max(100).default(3),

  // Clamped to 0.5 max. Old saves with values >0.5 are coerced on load so
  // `config.json` does not fail validation.
  BULB_SCALE: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.min(BULB_SCALE_LIMITS.MAX, Math.max(BULB_SCALE_LIMITS.MIN, v))
      : v),
    z.number().min(BULB_SCALE_LIMITS.MIN).max(BULB_SCALE_LIMITS.MAX),
  ).default(0.23),
  WIRE_TUNING_MODE: z.enum(WIRE_TUNING_MODE_NAMES).default('SIMPLE'),
  WIRE_WEIGHT: z.preprocess(
    (v) => (typeof v === 'number' ? Math.round(Math.min(WIRE_SIMPLE_WEIGHT_MAX, Math.max(0, v))) : v),
    z.number().int().min(0).max(WIRE_SIMPLE_WEIGHT_MAX),
  ).default(11),
  TWIST_DENSITY: z.preprocess(
    (v) => (typeof v === 'number' ? Math.round(Math.min(100, Math.max(0, v))) : v),
    z.number().int().min(0).max(100),
  ).default(100),
  ADVANCED_WIRE_THICKNESS: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.min(WIRE_CONTROL_LIMITS.THICKNESS_MAX, Math.max(WIRE_CONTROL_LIMITS.THICKNESS_MIN, v))
      : v),
    z.number().min(WIRE_CONTROL_LIMITS.THICKNESS_MIN).max(WIRE_CONTROL_LIMITS.THICKNESS_MAX),
  ).default(DEFAULT_WIRE_GEOMETRY.WIRE_THICKNESS),
  ADVANCED_WIRE_SEPARATION: z.number().min(WIRE_CONTROL_LIMITS.SEPARATION_MIN).max(WIRE_CONTROL_LIMITS.SEPARATION_MAX).default(DEFAULT_WIRE_GEOMETRY.WIRE_SEPARATION),
  ADVANCED_WIRE_TWISTS: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.round(Math.min(WIRE_CONTROL_LIMITS.TWISTS_MAX, Math.max(WIRE_CONTROL_LIMITS.TWISTS_MIN, v)))
      : v),
    z.number().int().min(WIRE_CONTROL_LIMITS.TWISTS_MIN).max(WIRE_CONTROL_LIMITS.TWISTS_MAX),
  ).default(DEFAULT_WIRE_GEOMETRY.WIRE_TWISTS),
  WIRE_COLOR_OVERRIDE_ENABLED: z.boolean().default(false),
  WIRE_A_COLOR: z.number().int().min(0).max(0xffffff).default(0xff7a00),
  WIRE_B_COLOR: z.number().int().min(0).max(0xffffff).default(0x39ff14),
  WIRE_A_LEAD_COLOR: z.number().int().min(0).max(0xffffff).default(0x00e5ff),
  WIRE_B_LEAD_COLOR: z.number().int().min(0).max(0xffffff).default(0xffff00),

  AMBIENT_INTENSITY: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.min(AMBIENT_INTENSITY_LIMITS.MAX, Math.max(AMBIENT_INTENSITY_LIMITS.MIN, v))
      : v),
    z.number().min(AMBIENT_INTENSITY_LIMITS.MIN).max(AMBIENT_INTENSITY_LIMITS.MAX),
  ).default(1),

  HALO_STRENGTH: z.number().min(0).max(5).default(0.65),
  HALO_RADIUS: z.preprocess(
    (v) => (typeof v === 'number' ? Math.min(0.3, Math.max(0, v)) : v),
    z.number().min(0).max(0.3),
  ).default(0.1),
  HALO_INTENSITY: z.number().min(0).max(5).default(0.85),
  HALO_SOURCE_INTENSITY: z.number().min(0).max(20).default(8),

  // Cap <1 so the bulb dome never fully occludes; old saves with 1.0 coerce.
  GLASS_OPACITY: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.min(GLASS_OPACITY_LIMITS.MAX, Math.max(GLASS_OPACITY_LIMITS.MIN, v))
      : v),
    z.number().min(GLASS_OPACITY_LIMITS.MIN).max(GLASS_OPACITY_LIMITS.MAX),
  ).default(0.15),
  // Maps to the custom dome shader’s specular width, not Three’s PBR
  // roughness (see BillboardBulbs glass material).
  GLASS_ROUGHNESS: z.number().min(0).max(1).default(0),
  BULB_INTERNAL_GLOW: z.number().min(0).max(800).default(6),

  ANIMATION_SPEED: z.number().min(0).max(5).default(0),
  SWAY_X: z.number().min(0).max(2).default(0),
  SWAY_Z: z.number().min(0).max(2).default(0),

  TWINKLE_SPEED: z.number().min(0).max(4).default(1),
  TWINKLE_MIN_INTENSITY: z.number().min(0).max(1).default(0),
  TWINKLE_MAX_INTENSITY: z.number().min(0).max(1).default(1),
  TWINKLE_RANDOMNESS: z.number().min(0).max(1).default(0),

  SNOW_COUNT: z.number().int().min(0).max(2000).default(100),
  SNOW_SPEED: z.number().min(0).max(0.1).default(0.005),
  SNOW_SIZE: z.number().min(0).max(0.5).default(0.01),
  SNOW_DRIFT: z.number().min(-1).max(1).default(0),

  STARS_COUNT: z.number().int().min(0).max(2000).default(100),
  STARS_SIZE: z.number().min(0).max(1).default(0.1),
  STARS_OPACITY: z.number().min(0).max(1).default(0.1),
  STARS_TWINKLE_SPEED: z.number().min(0).max(5).default(0),

  CAMERA_DISTANCE: z.number().min(1).max(200).default(22),
  // Offsets the look-at point from the string centroid (world). Previously
  // the camera "height" in world; semantics are now target-relative.
  CAMERA_HEIGHT: z.number().min(-50).max(50).default(0),
  CAMERA_X: z.number().min(-50).max(50).default(0),
});

export type Config = z.infer<typeof configSchema>;
export type ConfigKey = keyof Config;
export type LayoutModeName = (typeof LAYOUT_MODE_NAMES)[number];
export type LayoutEdgeName = (typeof LAYOUT_EDGE_NAMES)[number];
export type BulbOrientationModeName = (typeof BULB_ORIENTATION_MODE_NAMES)[number];
export type WireTuningModeName = (typeof WIRE_TUNING_MODE_NAMES)[number];

export const configPatchSchema = configSchema.partial();
export type ConfigPatch = z.infer<typeof configPatchSchema>;

export const DEFAULT_CONFIG: Config = configSchema.parse({});

const AUTO_CAMERA_KEYS = ['CAMERA_DISTANCE', 'CAMERA_HEIGHT', 'CAMERA_X'] as const;
const LAYOUT_CAMERA_RESET_KEYS = [
  'LAYOUT_MODE',
  'LAYOUT_EDGES',
  'LAYOUT_SHAPE_SIDES',
  'LAYOUT_CORNER_ROUNDNESS',
] as const;
const WIRE_KEYS = ['WIRE_THICKNESS', 'WIRE_SEPARATION', 'WIRE_TWISTS'] as const;
const WIRE_CONFIG_KEYS = [
  'WIRE_TUNING_MODE',
  'WIRE_WEIGHT',
  'TWIST_DENSITY',
  'ADVANCED_WIRE_THICKNESS',
  'ADVANCED_WIRE_SEPARATION',
  'ADVANCED_WIRE_TWISTS',
] as const;

type WireKey = (typeof WIRE_KEYS)[number];
export type WireValues = Record<WireKey, number>;
type WireConfigKey = (typeof WIRE_CONFIG_KEYS)[number];
export interface SimpleWireControls {
  weight: number;
  density: number;
}

export interface WireControlBounds {
  thickness: { min: number; max: number };
  separation: { min: number; max: number };
  twists: { min: number; max: number };
}

export function normalizeLayoutEdges(edges: readonly LayoutEdgeName[] | undefined): LayoutEdgeName[] {
  if (!edges || edges.length === 0) return ['TOP'];
  const selected = new Set(edges);
  const normalized = LAYOUT_EDGE_NAMES.filter((edge) => selected.has(edge));
  return normalized.length > 0 ? [...normalized] : ['TOP'];
}

export function applyLayoutGuardrails(config: Config): Config {
  return {
    ...config,
    LAYOUT_EDGES: normalizeLayoutEdges(config.LAYOUT_EDGES),
  };
}

export function withLayoutCameraDefaults(
  patch: ConfigPatch,
  current?: Pick<Config, (typeof LAYOUT_CAMERA_RESET_KEYS)[number]>,
): ConfigPatch {
  const normalizedPatch: ConfigPatch = patch.LAYOUT_EDGES === undefined
    ? patch
    : { ...patch, LAYOUT_EDGES: normalizeLayoutEdges(patch.LAYOUT_EDGES) };
  const layoutChanged = LAYOUT_CAMERA_RESET_KEYS.some((key) => {
    const next = normalizedPatch[key];
    if (next === undefined) return false;
    if (!current) return true;
    const prev = current[key];
    if (Array.isArray(next) && Array.isArray(prev)) {
      if (next.length !== prev.length) return true;
      return next.some((value, index) => value !== prev[index]);
    }
    return next !== prev;
  });

  if (!layoutChanged) return normalizedPatch;
  if (AUTO_CAMERA_KEYS.some((key) => normalizedPatch[key] !== undefined)) return normalizedPatch;

  return {
    ...normalizedPatch,
    CAMERA_DISTANCE: DEFAULT_CONFIG.CAMERA_DISTANCE,
    CAMERA_HEIGHT: DEFAULT_CONFIG.CAMERA_HEIGHT,
    CAMERA_X: DEFAULT_CONFIG.CAMERA_X,
  };
}

export function maxThicknessAtZeroSeparation(twists: number): number {
  const safeTwists = clampFinite(
    Math.round(twists),
    WIRE_CONTROL_LIMITS.TWISTS_MIN,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_TWISTS,
  );
  if (safeTwists <= 0) return WIRE_CONTROL_LIMITS.THICKNESS_MAX;

  const maxThickness = WIRE_CONTROL_LIMITS.ZERO_SEPARATION_SAFE_PRODUCT / safeTwists;
  return clampFinite(
    maxThickness,
    WIRE_CONTROL_LIMITS.THICKNESS_MIN,
    WIRE_CONTROL_LIMITS.THICKNESS_MAX,
    WIRE_CONTROL_LIMITS.THICKNESS_MAX,
  );
}

export function maxSafeWireThickness(separation: number, twists: number): number {
  const safeSeparation = clampFinite(
    separation,
    WIRE_CONTROL_LIMITS.SEPARATION_MIN,
    WIRE_CONTROL_LIMITS.SEPARATION_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_SEPARATION,
  );
  const zeroSeparationMax = maxThicknessAtZeroSeparation(twists);
  if (safeSeparation <= 0) return zeroSeparationMax;

  const safeTwists = Math.round(clampFinite(
    twists,
    WIRE_CONTROL_LIMITS.TWISTS_MIN,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_TWISTS,
  ));
  for (
    let thickness = WIRE_CONTROL_LIMITS.THICKNESS_MAX;
    thickness >= WIRE_CONTROL_LIMITS.THICKNESS_MIN;
    thickness -= 0.001
  ) {
    if (
      safeSeparation >= minCenterlineSeparation(thickness)
      && safeTwists <= maxSafeWireTwists(thickness, safeSeparation)
    ) {
      return Number(thickness.toFixed(3));
    }
  }
  return WIRE_CONTROL_LIMITS.THICKNESS_MIN;
}

export function minSafeWireSeparation(thickness: number, twists: number): number {
  const safeThickness = clampFinite(
    thickness,
    WIRE_CONTROL_LIMITS.THICKNESS_MIN,
    WIRE_CONTROL_LIMITS.THICKNESS_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_THICKNESS,
  );
  if (safeThickness <= WIRE_CONTROL_LIMITS.THICKNESS_MIN) return WIRE_CONTROL_LIMITS.SEPARATION_MIN;
  const safeTwists = clampFinite(
    Math.round(twists),
    WIRE_CONTROL_LIMITS.TWISTS_MIN,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_TWISTS,
  );
  const bounds = wireSeparationBoundsFor(safeThickness, safeTwists);

  for (
    let separation = bounds.min;
    separation <= WIRE_CONTROL_LIMITS.SEPARATION_MAX;
    separation += 0.001
  ) {
    if (
      separation >= minCenterlineSeparation(safeThickness)
      && safeTwists <= maxSafeWireTwists(safeThickness, separation)
    ) {
      return Number(separation.toFixed(3));
    }
  }
  return bounds.max;
}

export function maxSafeWireTwists(thickness: number, separation: number): number {
  const safeThickness = clampFinite(
    thickness,
    WIRE_CONTROL_LIMITS.THICKNESS_MIN,
    WIRE_CONTROL_LIMITS.THICKNESS_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_THICKNESS,
  );
  const safeSeparation = clampFinite(
    separation,
    WIRE_CONTROL_LIMITS.SEPARATION_MIN,
    WIRE_CONTROL_LIMITS.SEPARATION_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_SEPARATION,
  );

  return Math.floor(clampFinite(
    twistBudgetForWire(safeThickness, safeSeparation) / safeThickness,
    WIRE_CONTROL_LIMITS.TWISTS_MIN,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
  ));
}

export function getWireControlBounds(_values: WireValues): WireControlBounds {
  return {
    thickness: {
      min: WIRE_CONTROL_LIMITS.THICKNESS_MIN,
      max: WIRE_CONTROL_LIMITS.THICKNESS_MAX,
    },
    separation: {
      min: WIRE_CONTROL_LIMITS.SEPARATION_MIN,
      max: WIRE_CONTROL_LIMITS.SEPARATION_MAX,
    },
    twists: {
      min: WIRE_CONTROL_LIMITS.TWISTS_MIN,
      max: WIRE_CONTROL_LIMITS.TWISTS_MAX,
    },
  };
}

export function applyWireGuardrails(config: Config): Config {
  if (config.WIRE_TUNING_MODE === 'ADVANCED') {
    const normalized = normalizeWireForSafeConfig({
      WIRE_THICKNESS: config.ADVANCED_WIRE_THICKNESS,
      WIRE_SEPARATION: config.ADVANCED_WIRE_SEPARATION,
      WIRE_TWISTS: config.ADVANCED_WIRE_TWISTS,
    });
    return {
      ...config,
      ADVANCED_WIRE_THICKNESS: normalized.WIRE_THICKNESS,
      ADVANCED_WIRE_SEPARATION: normalized.WIRE_SEPARATION,
      ADVANCED_WIRE_TWISTS: normalized.WIRE_TWISTS,
    };
  }

  return {
    ...config,
    WIRE_WEIGHT: clampFinite(config.WIRE_WEIGHT, 0, WIRE_SIMPLE_WEIGHT_MAX, 11),
    TWIST_DENSITY: Math.round(clampFinite(config.TWIST_DENSITY, 0, 100, 100)),
  };
}

export function withWireGuardrails(
  patch: ConfigPatch,
  current?: Config,
): ConfigPatch {
  const patchedWireKeys = WIRE_CONFIG_KEYS.filter((key) => patch[key] !== undefined);
  if (patchedWireKeys.length === 0) return patch;

  const base = applyWireGuardrails(current ?? DEFAULT_CONFIG);
  const normalized = applyWireGuardrails({ ...base, ...patch });
  const out: ConfigPatch = { ...patch };
  const outRecord = out as Record<string, unknown>;
  for (const key of WIRE_CONFIG_KEYS) {
    if (patchedWireKeys.includes(key) || normalized[key] !== base[key]) {
      outRecord[key] = normalized[key];
    }
  }
  return out;
}

export function resolveWireGeometry(config: Config): WireValues {
  if (config.WIRE_TUNING_MODE === 'ADVANCED') {
    return normalizeWireForSafeConfig({
      WIRE_THICKNESS: config.ADVANCED_WIRE_THICKNESS,
      WIRE_SEPARATION: config.ADVANCED_WIRE_SEPARATION,
      WIRE_TWISTS: config.ADVANCED_WIRE_TWISTS,
    });
  }

  return deriveWireFromSimpleControls({
    weight: config.WIRE_WEIGHT,
    density: config.TWIST_DENSITY,
  });
}

export function normalizeWireForSafeConfig(values: Partial<WireValues>): WireValues {
  const raw = normalizeWireAbsolutes(values);
  const initialSeparationBounds = wireSeparationBoundsFor(
    raw.WIRE_THICKNESS,
    raw.WIRE_TWISTS,
  );
  const boundedSeparation = clampFinite(
    raw.WIRE_SEPARATION,
    initialSeparationBounds.min,
    initialSeparationBounds.max,
    initialSeparationBounds.min,
  );
  const safeTwists = Math.min(
    raw.WIRE_TWISTS,
    maxSafeWireTwists(raw.WIRE_THICKNESS, boundedSeparation),
  );
  const finalSeparationBounds = wireSeparationBoundsFor(
    raw.WIRE_THICKNESS,
    safeTwists,
  );
  const safeSeparation = clampFinite(
    boundedSeparation,
    finalSeparationBounds.min,
    finalSeparationBounds.max,
    finalSeparationBounds.min,
  );
  const finalTwists = Math.min(
    safeTwists,
    maxSafeWireTwists(raw.WIRE_THICKNESS, safeSeparation),
  );

  return {
    WIRE_THICKNESS: raw.WIRE_THICKNESS,
    WIRE_SEPARATION: Number(safeSeparation.toFixed(3)),
    WIRE_TWISTS: finalTwists,
  };
}

export function wireThicknessToControlValue(thickness: number): number {
  const normalized = (
    (clampFinite(
      thickness,
      WIRE_CONTROL_LIMITS.THICKNESS_MIN,
      WIRE_CONTROL_LIMITS.THICKNESS_MAX,
      DEFAULT_WIRE_GEOMETRY.WIRE_THICKNESS,
    ) - WIRE_CONTROL_LIMITS.THICKNESS_MIN)
    / (WIRE_CONTROL_LIMITS.THICKNESS_MAX - WIRE_CONTROL_LIMITS.THICKNESS_MIN)
  ) * WIRE_CONTROL_PERCENT_MAX;
  return roundWireControl(normalized);
}

export function wireThicknessFromControlValue(value: number): number {
  const percent = clampWireControl(value) / WIRE_CONTROL_PERCENT_MAX;
  return Number((
    WIRE_CONTROL_LIMITS.THICKNESS_MIN
    + percent * (WIRE_CONTROL_LIMITS.THICKNESS_MAX - WIRE_CONTROL_LIMITS.THICKNESS_MIN)
  ).toFixed(3));
}

export function wireWeightToControlValue(weight: number): number {
  const safeWeight = clampFinite(weight, 0, WIRE_SIMPLE_WEIGHT_MAX, 0);
  return Math.round((safeWeight / WIRE_SIMPLE_WEIGHT_MAX) * WIRE_SIMPLE_WEIGHT_CONTROL_MAX);
}

export function wireWeightFromControlValue(value: number): number {
  return Math.round(
    (clampWireControl(value) / WIRE_SIMPLE_WEIGHT_CONTROL_MAX)
      * WIRE_SIMPLE_WEIGHT_MAX,
  );
}

export function wireWeightToRawThickness(weight: number): number {
  return wireThicknessFromControlValue(Math.min(WIRE_SIMPLE_WEIGHT_MAX, weight));
}

export function rawThicknessToWireWeight(thickness: number): number {
  return wireThicknessToControlValue(thickness);
}

export function bulbScaleToControlValue(scale: number): number {
  const normalized = (
    (clampFinite(
      scale,
      BULB_SCALE_LIMITS.MIN,
      BULB_SCALE_LIMITS.MAX,
      DEFAULT_CONFIG.BULB_SCALE,
    ) - BULB_SCALE_LIMITS.MIN)
    / (BULB_SCALE_LIMITS.MAX - BULB_SCALE_LIMITS.MIN)
  ) * BULB_SCALE_CONTROL_MAX;
  return roundWireControl(normalized);
}

export function bulbScaleFromControlValue(value: number): number {
  const percent = clampFinite(
    value,
    BULB_SCALE_CONTROL_MIN,
    BULB_SCALE_CONTROL_MAX,
    BULB_SCALE_CONTROL_MIN,
  ) / BULB_SCALE_CONTROL_MAX;

  return Number((
    BULB_SCALE_LIMITS.MIN
    + percent * (BULB_SCALE_LIMITS.MAX - BULB_SCALE_LIMITS.MIN)
  ).toFixed(3));
}

export function glassOpacityToControlValue(opacity: number): number {
  const normalized = (
    (clampFinite(
      opacity,
      GLASS_OPACITY_LIMITS.MIN,
      GLASS_OPACITY_LIMITS.MAX,
      DEFAULT_CONFIG.GLASS_OPACITY,
    ) - GLASS_OPACITY_LIMITS.MIN)
    / (GLASS_OPACITY_LIMITS.MAX - GLASS_OPACITY_LIMITS.MIN)
  ) * GLASS_OPACITY_CONTROL_MAX;
  return roundWireControl(normalized);
}

export function glassOpacityFromControlValue(value: number): number {
  const percent = clampFinite(
    value,
    GLASS_OPACITY_CONTROL_MIN,
    GLASS_OPACITY_CONTROL_MAX,
    GLASS_OPACITY_CONTROL_MIN,
  ) / GLASS_OPACITY_CONTROL_MAX;

  return Number((
    GLASS_OPACITY_LIMITS.MIN
    + percent * (GLASS_OPACITY_LIMITS.MAX - GLASS_OPACITY_LIMITS.MIN)
  ).toFixed(3));
}

export function ambientIntensityToControlValue(intensity: number): number {
  const normalized = (
    (clampFinite(
      intensity,
      AMBIENT_INTENSITY_LIMITS.MIN,
      AMBIENT_INTENSITY_LIMITS.MAX,
      DEFAULT_CONFIG.AMBIENT_INTENSITY,
    ) - AMBIENT_INTENSITY_LIMITS.MIN)
    / (AMBIENT_INTENSITY_LIMITS.MAX - AMBIENT_INTENSITY_LIMITS.MIN)
  ) * AMBIENT_INTENSITY_CONTROL_MAX;

  return roundWireControl(normalized);
}

export function ambientIntensityFromControlValue(value: number): number {
  const percent = clampFinite(
    value,
    AMBIENT_INTENSITY_CONTROL_MIN,
    AMBIENT_INTENSITY_CONTROL_MAX,
    AMBIENT_INTENSITY_CONTROL_MIN,
  ) / AMBIENT_INTENSITY_CONTROL_MAX;

  return Number((
    AMBIENT_INTENSITY_LIMITS.MIN
    + percent * (AMBIENT_INTENSITY_LIMITS.MAX - AMBIENT_INTENSITY_LIMITS.MIN)
  ).toFixed(2));
}

export function reflectionIntensityToControlValue(intensity: number): number {
  const normalized = (
    (clampFinite(
      intensity,
      REFLECTION_INTENSITY_LIMITS.MIN,
      REFLECTION_INTENSITY_LIMITS.MAX,
      DEFAULT_CONFIG.REFLECTION_INTENSITY,
    ) - REFLECTION_INTENSITY_LIMITS.MIN)
    / (REFLECTION_INTENSITY_LIMITS.MAX - REFLECTION_INTENSITY_LIMITS.MIN)
  ) * REFLECTION_INTENSITY_CONTROL_MAX;

  return roundWireControl(normalized);
}

export function reflectionIntensityFromControlValue(value: number): number {
  const percent = clampFinite(
    value,
    REFLECTION_INTENSITY_CONTROL_MIN,
    REFLECTION_INTENSITY_CONTROL_MAX,
    REFLECTION_INTENSITY_CONTROL_MIN,
  ) / REFLECTION_INTENSITY_CONTROL_MAX;

  return Number((
    REFLECTION_INTENSITY_LIMITS.MIN
    + percent * (REFLECTION_INTENSITY_LIMITS.MAX - REFLECTION_INTENSITY_LIMITS.MIN)
  ).toFixed(2));
}

export function wireSeparationToControlValue(
  separation: number,
  thickness: number,
  twists: number,
): number {
  const { min, max } = wireSeparationBoundsFor(thickness, twists);
  if (min >= max) return WIRE_CONTROL_PERCENT_MAX;
  const safeSeparation = clampFinite(separation, min, max, min);
  if (Math.abs(safeSeparation - min) <= WIRE_CONTROL_ENDPOINT_EPSILON) {
    return WIRE_CONTROL_PERCENT_MIN;
  }
  if (Math.abs(safeSeparation - max) <= WIRE_CONTROL_ENDPOINT_EPSILON) {
    return WIRE_CONTROL_PERCENT_MAX;
  }
  return roundWireControl(((safeSeparation - min) / (max - min)) * WIRE_CONTROL_PERCENT_MAX);
}

export function wireSeparationFromControlValue(
  value: number,
  thickness: number,
  twists: number,
): number {
  const { min, max } = wireSeparationBoundsFor(thickness, twists);
  if (min >= max) return max;
  const percent = clampWireControl(value) / WIRE_CONTROL_PERCENT_MAX;
  return Number((min + percent * (max - min)).toFixed(3));
}

export function wireTwistIntentFromControlValue(value: number): number {
  return Math.round(
    (clampWireControl(value) / WIRE_CONTROL_PERCENT_MAX)
      * WIRE_CONTROL_LIMITS.TWISTS_MAX,
  );
}

export function wireDensityToRawIntent(
  density: number,
  weight = WIRE_SIMPLE_WEIGHT_MAX,
): number {
  const maxTwists = maxSimpleWireTwistsForWeight(weight);
  return Math.round((clampWireControl(density) / WIRE_CONTROL_PERCENT_MAX) * maxTwists);
}

export function deriveWireFromSimpleControls(controls: SimpleWireControls): WireValues {
  const thickness = wireWeightToRawThickness(controls.weight);
  const twistIntent = wireDensityToRawIntent(controls.density, controls.weight);
  const separation = simpleWireSeparationFor(thickness, twistIntent);

  return normalizeWireForSafeConfig({
    WIRE_THICKNESS: thickness,
    WIRE_SEPARATION: separation,
    WIRE_TWISTS: twistIntent,
  });
}

export function maxSimpleWireTwistsForWeight(weight: number): number {
  const thickness = wireWeightToRawThickness(weight);
  let maxTwists: number = WIRE_CONTROL_LIMITS.TWISTS_MIN;

  for (
    let twists = WIRE_CONTROL_LIMITS.TWISTS_MIN;
    twists <= WIRE_CONTROL_LIMITS.TWISTS_MAX;
    twists += 1
  ) {
    const normalized = normalizeWireForSafeConfig({
      WIRE_THICKNESS: thickness,
      WIRE_SEPARATION: simpleWireSeparationFor(thickness, twists),
      WIRE_TWISTS: twists,
    });
    maxTwists = Math.max(maxTwists, normalized.WIRE_TWISTS);
  }

  return maxTwists;
}

function simpleWireSeparationFor(thickness: number, twists: number): number {
  const separationBounds = wireSeparationBoundsFor(thickness, twists);
  return Number((
    separationBounds.min
    + WIRE_SIMPLE_SPACING_RATIO * (separationBounds.max - separationBounds.min)
  ).toFixed(3));
}

export function wireTwistsToControlValue(
  twists: number,
  thickness: number,
  separation: number,
): number {
  const max = maxSafeWireTwists(thickness, separation);
  if (max <= WIRE_CONTROL_LIMITS.TWISTS_MIN) return WIRE_CONTROL_PERCENT_MIN;
  const safeTwists = clampFinite(twists, WIRE_CONTROL_LIMITS.TWISTS_MIN, max, max);
  if (safeTwists <= WIRE_CONTROL_LIMITS.TWISTS_MIN) return WIRE_CONTROL_PERCENT_MIN;
  if (safeTwists >= max) return WIRE_CONTROL_PERCENT_MAX;
  return roundWireControl((safeTwists / max) * WIRE_CONTROL_PERCENT_MAX);
}

export function wireTwistsFromControlValue(
  value: number,
  thickness: number,
  separation: number,
): number {
  const max = maxSafeWireTwists(thickness, separation);
  if (max <= WIRE_CONTROL_LIMITS.TWISTS_MIN) return WIRE_CONTROL_LIMITS.TWISTS_MIN;
  const control = clampWireControl(value);
  if (control >= WIRE_CONTROL_PERCENT_MAX) return max;
  if (control <= WIRE_CONTROL_PERCENT_MIN) return WIRE_CONTROL_LIMITS.TWISTS_MIN;
  return Math.floor((control / WIRE_CONTROL_PERCENT_MAX) * max);
}

function twistBudgetForWire(thickness: number, separation: number): number {
  return (
    WIRE_CONTROL_LIMITS.ZERO_SEPARATION_SAFE_PRODUCT
    + Math.max(0, separation) * (
      WIRE_CONTROL_LIMITS.TWIST_SEPARATION_GAIN
      - WIRE_CONTROL_LIMITS.TWIST_THICKNESS_DRAG * thickness
    )
  );
}

function minCenterlineSeparation(thickness: number): number {
  if (thickness <= WIRE_CONTROL_LIMITS.THICKNESS_MIN) return WIRE_CONTROL_LIMITS.SEPARATION_MIN;
  return clampFinite(
    (thickness - WIRE_CONTROL_LIMITS.CENTERLINE_CLEARANCE_BASE)
      / WIRE_CONTROL_LIMITS.CENTERLINE_CLEARANCE_RATIO,
    WIRE_CONTROL_LIMITS.SEPARATION_MIN,
    WIRE_CONTROL_LIMITS.SEPARATION_MAX,
    WIRE_CONTROL_LIMITS.SEPARATION_MIN,
  );
}

function wireSeparationBoundsFor(thickness: number, twists: number): { min: number; max: number } {
  const safeThickness = clampFinite(
    thickness,
    WIRE_CONTROL_LIMITS.THICKNESS_MIN,
    WIRE_CONTROL_LIMITS.THICKNESS_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_THICKNESS,
  );
  const twistRatio = clampFinite(
    twists,
    WIRE_CONTROL_LIMITS.TWISTS_MIN,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
    DEFAULT_WIRE_GEOMETRY.WIRE_TWISTS,
  ) / WIRE_CONTROL_LIMITS.TWISTS_MAX;
  const thinWeight = thinWireSeparationWeight(safeThickness);
  const thinMin = lerp(
    WIRE_CONTROL_LIMITS.THIN_WIRE_SEPARATION_MIN_LOW_TWIST,
    WIRE_CONTROL_LIMITS.THIN_WIRE_SEPARATION_MIN_HIGH_TWIST,
    twistRatio,
  );
  const thinMax = lerp(
    WIRE_CONTROL_LIMITS.THIN_WIRE_SEPARATION_MAX_LOW_TWIST,
    WIRE_CONTROL_LIMITS.THIN_WIRE_SEPARATION_MAX_HIGH_TWIST,
    twistRatio,
  );
  const min = Math.max(
    minCenterlineSeparation(safeThickness),
    lerp(WIRE_CONTROL_LIMITS.SEPARATION_MIN, thinMin, thinWeight),
  );
  const max = lerp(WIRE_CONTROL_LIMITS.SEPARATION_MAX, thinMax, thinWeight);
  return {
    min: Number(min.toFixed(3)),
    max: Number(Math.max(min, max).toFixed(3)),
  };
}

function thinWireSeparationWeight(thickness: number): number {
  const fadeRange = WIRE_CONTROL_LIMITS.THIN_WIRE_SEPARATION_FADE_END
    - WIRE_CONTROL_LIMITS.THICKNESS_MIN;
  if (fadeRange <= 0) return 0;
  const t = clampFinite(
    (thickness - WIRE_CONTROL_LIMITS.THICKNESS_MIN) / fadeRange,
    0,
    1,
    1,
  );
  return 1 - t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clampWireControl(value: number): number {
  return clampFinite(
    value,
    WIRE_CONTROL_PERCENT_MIN,
    WIRE_CONTROL_PERCENT_MAX,
    WIRE_CONTROL_PERCENT_MIN,
  );
}

function roundWireControl(value: number): number {
  return Math.round(clampWireControl(value));
}

function normalizeWireAbsolutes(values: Partial<WireValues>): WireValues {
  return {
    WIRE_THICKNESS: clampFinite(
      values.WIRE_THICKNESS,
      WIRE_CONTROL_LIMITS.THICKNESS_MIN,
      WIRE_CONTROL_LIMITS.THICKNESS_MAX,
      DEFAULT_WIRE_GEOMETRY.WIRE_THICKNESS,
    ),
    WIRE_SEPARATION: clampFinite(
      values.WIRE_SEPARATION,
      WIRE_CONTROL_LIMITS.SEPARATION_MIN,
      WIRE_CONTROL_LIMITS.SEPARATION_MAX,
      DEFAULT_WIRE_GEOMETRY.WIRE_SEPARATION,
    ),
    WIRE_TWISTS: Math.round(clampFinite(
      values.WIRE_TWISTS,
      WIRE_CONTROL_LIMITS.TWISTS_MIN,
      WIRE_CONTROL_LIMITS.TWISTS_MAX,
      DEFAULT_WIRE_GEOMETRY.WIRE_TWISTS,
    )),
  };
}

function clampFinite(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numberValue));
}

export const THEMES: Record<(typeof THEME_NAMES)[number], { bulbs: number[] }> = {
  CANDY_CANE: { bulbs: [0xff0000, 0xffffff] },
  CHRISTMAS: { bulbs: [0x00aa00, 0xff0000] },
  CLASSIC: { bulbs: [0xff0000, 0x00aa00, 0x0000ff, 0xffa500, 0xffffff] },
  CYBERPUNK: { bulbs: [0xff00ff, 0x00ffff, 0xff0080, 0xffff00, 0x00ff00] },
  FANTASY: { bulbs: [0x9370db, 0x20b2aa, 0x32cd32, 0x87ceeb] },
  FIRE: { bulbs: [0xb22222, 0xdc143c, 0xff0000, 0xff4500, 0xff6347, 0xffa500, 0xffff00] },
  FOREST: { bulbs: [0x228b22, 0x2e8b57, 0x32cd32, 0x3cb371] },
  GHOST: { bulbs: [0xffffff, 0xe0e0e0, 0xc0c0c0] },
  GOLD_RUSH: { bulbs: [0xffd700, 0xdaa520, 0xd4a520, 0xff8c00] },
  HALLOWEEN: { bulbs: [0xff8c00, 0x9932cc] },
  ICY: { bulbs: [0xffffff, 0xe0f7ff, 0xd0f0ff, 0x87ceeb, 0x4682b4] },
  LAVENDER: { bulbs: [0xe6e6fa, 0xd8bfd8, 0xdda0dd, 0xba55d3] },
  MINT: { bulbs: [0x98ff98, 0xaaffaa, 0x90ee90, 0xb0ffb0] },
  OCEAN: { bulbs: [0x0077be, 0x4169e1, 0x1e90ff, 0x40e0d0, 0x00bfff, 0x87ceeb] },
  PASTEL_DREAM: { bulbs: [0xffb3d9, 0xffb3de, 0xffc0cb, 0xffe4b5, 0xfffacd, 0xadd8e6, 0xb0e0e6, 0xe6e6fa] },
  PEACH: { bulbs: [0xffdab9, 0xffb3a7, 0xff9980, 0xff8566] },
  RAINBOW: { bulbs: [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff, 0x9400d3] },
  ROYAL: { bulbs: [0x4b0082, 0x6a5acd, 0x9370db, 0xffd700] },
  TROPICAL: { bulbs: [0xff1493, 0xff69b4, 0x00ced1, 0x7fff00, 0xffff00] },
  VAPORWAVE: { bulbs: [0xff00ff, 0x00ffff, 0xff1493, 0x9400d3] },
  VINTAGE: { bulbs: [0x8b7355, 0xa0826d, 0xbc9b6a, 0xd2b48c] },
  WARM_SUNSET: { bulbs: [0xff4500, 0xff6347, 0xff8c00, 0xffa500] },
};

export const WIRE_THEMES: Record<(typeof WIRE_THEME_NAMES)[number], { A: number; B: number }> = {
  BLACK: { A: 0x0a0a0a, B: 0x1a1a1a },
  CANDY_CANE: { A: 0xff0000, B: 0xffffff },
  CHRISTMAS: { A: 0x006600, B: 0x880000 },
  COPPER: { A: 0xcd7f32, B: 0xeda76a },
  FIRE: { A: 0x8b0000, B: 0xff4500 },
  FOREST: { A: 0x228b22, B: 0x32cd32 },
  GOLD: { A: 0xdaa520, B: 0xffd700 },
  HALLOWEEN: { A: 0xff6600, B: 0x9933ff },
  ICY: { A: 0x2233aa, B: 0x87ceeb },
  MINT: { A: 0x20b2aa, B: 0x66cdaa },
  OCEAN: { A: 0x0077be, B: 0x40e0d0 },
  ORANGE: { A: 0xff6347, B: 0xff8c00 },
  PINK: { A: 0xff69b4, B: 0xffb6c1 },
  PURPLE: { A: 0x4b0082, B: 0x663399 },
  SILVER: { A: 0xc0c0c0, B: 0xf0f0f0 },
  TEAL: { A: 0x008080, B: 0x20b2aa },
  WHITE: { A: 0xf5f5f5, B: 0xffffff },
  YELLOW: { A: 0xffd700, B: 0xffff00 },
};

export const SOCKET_THEMES: Record<(typeof SOCKET_THEME_NAMES)[number], number | null> = {
  WIRE_MATCH: null,
  GOLD: 0xffd700,
  SILVER: 0xc0c0c0,
  COPPER: 0xb87333,
};

export const METAL_THEMES = {
  WIRE: ['COPPER', 'GOLD', 'SILVER'] as const,
  SOCKET: ['COPPER', 'GOLD', 'SILVER'] as const,
};
