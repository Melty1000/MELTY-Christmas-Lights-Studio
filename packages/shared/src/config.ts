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

export const LIGHT_LAYOUT_NAMES = [
  'TOP',
  'BOTTOM',
  'RIGHT',
  'LEFT',
  'TOP_RIGHT',
  'TOP_LEFT',
  'TOP_BOTTOM',
  'BOTTOM_RIGHT',
  'BOTTOM_LEFT',
  'LEFT_RIGHT',
  'LEFT_TOP_RIGHT',
  'TOP_RIGHT_BOTTOM',
  'RIGHT_BOTTOM_LEFT',
  'BOTTOM_LEFT_TOP',
  'ALL_SIDES',
  'DRAPES',
  'DUAL_DRAPES',
  'CIRCLE',
  'TRIANGLE',
  'SQUARE',
  'PENTAGON',
  'HEXAGON',
  'HEPTAGON',
  'OCTAGON',
] as const;

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
} as const;

export const configSchema = z.object({
  ANIMATION_STYLE: z.enum(ANIMATION_STYLES).default('SOFT_TWINKLE'),

  STARS_ENABLED: z.boolean().default(false),
  SNOW_ENABLED: z.boolean().default(false),
  BACKGROUND_ENABLED: z.boolean().default(false),
  POINT_LIGHTS_ENABLED: z.boolean().default(false),
  ANTIALIAS_ENABLED: z.boolean().default(true),
  STATS_ENABLED: z.boolean().default(false),

  ACTIVE_THEME: z.enum(THEME_NAMES).default('GHOST'),
  WIRE_THEME: z.enum(WIRE_THEME_NAMES).default('SILVER'),
  SOCKET_THEME: z.enum(SOCKET_THEME_NAMES).default('WIRE_MATCH'),

  LIGHT_LAYOUT: z.enum(LIGHT_LAYOUT_NAMES).default('TOP'),
  LAYOUT_MARGIN: z.number().min(0).max(0.35).default(0),
  LAYOUT_SCALE: z.number().min(0.2).max(1.5).default(1),
  LAYOUT_OFFSET_X: z.number().min(-1).max(1).default(0),
  LAYOUT_OFFSET_Y: z.number().min(-1).max(1).default(0),

  NUM_PINS: z.number().int().min(2).max(20).default(7),
  SAG_AMPLITUDE: z.number().min(0).max(2).default(0.4),
  LIGHTS_PER_SEGMENT: z.number().int().min(1).max(100).default(3),

  // Clamped to 1 max. Old saves with values >1 are coerced on load so
  // `config.json` does not fail validation.
  BULB_SCALE: z.preprocess(
    (v) => (typeof v === 'number' ? Math.min(1, Math.max(0.1, v)) : v),
    z.number().min(0.1).max(1),
  ).default(0.23),
  WIRE_THICKNESS: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.min(WIRE_CONTROL_LIMITS.THICKNESS_MAX, Math.max(WIRE_CONTROL_LIMITS.THICKNESS_MIN, v))
      : v),
    z.number().min(WIRE_CONTROL_LIMITS.THICKNESS_MIN).max(WIRE_CONTROL_LIMITS.THICKNESS_MAX),
  ).default(0.031),
  WIRE_SEPARATION: z.number().min(WIRE_CONTROL_LIMITS.SEPARATION_MIN).max(WIRE_CONTROL_LIMITS.SEPARATION_MAX).default(0.036),
  WIRE_TWISTS: z.preprocess(
    (v) => (typeof v === 'number'
      ? Math.round(Math.min(WIRE_CONTROL_LIMITS.TWISTS_MAX, Math.max(WIRE_CONTROL_LIMITS.TWISTS_MIN, v)))
      : v),
    z.number().int().min(WIRE_CONTROL_LIMITS.TWISTS_MIN).max(WIRE_CONTROL_LIMITS.TWISTS_MAX),
  ).default(200),

  AMBIENT_INTENSITY: z.preprocess(
    (v) => (typeof v === 'number' ? Math.min(5, Math.max(0.15, v)) : v),
    z.number().min(0.15).max(5),
  ).default(1),
  KEY_LIGHT_INTENSITY: z.number().min(0).max(5).default(1.2),
  FILL_LIGHT_INTENSITY: z.number().min(0).max(5).default(0.42),
  HEMI_LIGHT_INTENSITY: z.number().min(0).max(5).default(0.35),

  POSTFX_ENABLED: z.boolean().default(true),
  BLOOM_STRENGTH: z.number().min(0).max(5).default(0.65),
  BLOOM_RADIUS: z.preprocess(
    (v) => (typeof v === 'number' ? Math.min(1, Math.max(0, v)) : v),
    z.number().min(0).max(1),
  ).default(0.1),
  BLOOM_THRESHOLD: z.number().min(0).max(1).default(0.12),
  BLOOM_INTENSITY: z.number().min(0).max(5).default(0.85),

  // Cap <1 so the bulb dome never fully occludes; old saves with 1.0 coerce.
  GLASS_OPACITY: z.preprocess(
    (v) => (typeof v === 'number' ? Math.min(0.9, v) : v),
    z.number().min(0).max(0.9),
  ).default(0.15),
  // Maps to the custom dome shader’s specular width, not Three’s PBR
  // roughness (see BillboardBulbs glass material).
  GLASS_ROUGHNESS: z.number().min(0).max(1).default(0),
  EMISSIVE_INTENSITY: z.number().min(0).max(20).default(6),

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

  TENSION: z.number().min(-1).max(1).default(0),
});

export type Config = z.infer<typeof configSchema>;
export type ConfigKey = keyof Config;
export type LightLayoutName = (typeof LIGHT_LAYOUT_NAMES)[number];

export const configPatchSchema = configSchema.partial();
export type ConfigPatch = z.infer<typeof configPatchSchema>;

export const DEFAULT_CONFIG: Config = configSchema.parse({});

const AUTO_CAMERA_KEYS = ['CAMERA_DISTANCE', 'CAMERA_HEIGHT', 'CAMERA_X'] as const;
const WIRE_KEYS = ['WIRE_THICKNESS', 'WIRE_SEPARATION', 'WIRE_TWISTS'] as const;

type WireKey = (typeof WIRE_KEYS)[number];
type WireValues = Pick<Config, WireKey>;

const WIRE_CONTROL_PERCENT_MIN = 0;
const WIRE_CONTROL_PERCENT_MAX = 100;

export interface WireControlBounds {
  thickness: { min: number; max: number };
  separation: { min: number; max: number };
  twists: { min: number; max: number };
}

export function withLayoutCameraDefaults(
  patch: ConfigPatch,
  current?: Pick<Config, 'LIGHT_LAYOUT'>,
): ConfigPatch {
  if (patch.LIGHT_LAYOUT === undefined) return patch;
  if (current && patch.LIGHT_LAYOUT === current.LIGHT_LAYOUT) return patch;
  if (AUTO_CAMERA_KEYS.some((key) => patch[key] !== undefined)) return patch;

  return {
    ...patch,
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
    DEFAULT_CONFIG.WIRE_TWISTS,
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
    DEFAULT_CONFIG.WIRE_SEPARATION,
  );
  const zeroSeparationMax = maxThicknessAtZeroSeparation(twists);
  if (safeSeparation <= 0) return zeroSeparationMax;

  const safeTwists = Math.round(clampFinite(
    twists,
    WIRE_CONTROL_LIMITS.TWISTS_MIN,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
    DEFAULT_CONFIG.WIRE_TWISTS,
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
    DEFAULT_CONFIG.WIRE_THICKNESS,
  );
  if (safeThickness <= WIRE_CONTROL_LIMITS.THICKNESS_MIN) return WIRE_CONTROL_LIMITS.SEPARATION_MIN;
  const safeTwists = clampFinite(
    Math.round(twists),
    WIRE_CONTROL_LIMITS.TWISTS_MIN,
    WIRE_CONTROL_LIMITS.TWISTS_MAX,
    DEFAULT_CONFIG.WIRE_TWISTS,
  );

  for (
    let separation = WIRE_CONTROL_LIMITS.SEPARATION_MIN;
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
  return WIRE_CONTROL_LIMITS.SEPARATION_MAX;
}

export function maxSafeWireTwists(thickness: number, separation: number): number {
  const safeThickness = clampFinite(
    thickness,
    WIRE_CONTROL_LIMITS.THICKNESS_MIN,
    WIRE_CONTROL_LIMITS.THICKNESS_MAX,
    DEFAULT_CONFIG.WIRE_THICKNESS,
  );
  const safeSeparation = clampFinite(
    separation,
    WIRE_CONTROL_LIMITS.SEPARATION_MIN,
    WIRE_CONTROL_LIMITS.SEPARATION_MAX,
    DEFAULT_CONFIG.WIRE_SEPARATION,
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
  return {
    ...config,
    ...normalizeWireForSafeConfig(config),
  };
}

export function withWireGuardrails(
  patch: ConfigPatch,
  current?: WireValues,
): ConfigPatch {
  const patchedWireKeys = WIRE_KEYS.filter((key) => patch[key] !== undefined);
  if (patchedWireKeys.length === 0) return patch;

  const base = normalizeWireAbsolutes(current ?? DEFAULT_CONFIG);
  const normalized = normalizeWireForSafeConfig({
    WIRE_THICKNESS: patch.WIRE_THICKNESS ?? base.WIRE_THICKNESS,
    WIRE_SEPARATION: patch.WIRE_SEPARATION ?? base.WIRE_SEPARATION,
    WIRE_TWISTS: patch.WIRE_TWISTS ?? base.WIRE_TWISTS,
  });
  const out: ConfigPatch = { ...patch };
  for (const key of WIRE_KEYS) {
    if (patchedWireKeys.includes(key) || normalized[key] !== base[key]) {
      out[key] = normalized[key];
    }
  }
  return out;
}

export function normalizeWireForSafeConfig(values: Partial<WireValues>): WireValues {
  const raw = normalizeWireAbsolutes(values);
  const safeSeparation = Math.max(
    raw.WIRE_SEPARATION,
    minCenterlineSeparation(raw.WIRE_THICKNESS),
  );
  const safeTwists = Math.min(
    raw.WIRE_TWISTS,
    maxSafeWireTwists(raw.WIRE_THICKNESS, safeSeparation),
  );

  return {
    WIRE_THICKNESS: raw.WIRE_THICKNESS,
    WIRE_SEPARATION: Number(safeSeparation.toFixed(3)),
    WIRE_TWISTS: safeTwists,
  };
}

export function wireThicknessToControlValue(thickness: number): number {
  const normalized = (
    (clampFinite(
      thickness,
      WIRE_CONTROL_LIMITS.THICKNESS_MIN,
      WIRE_CONTROL_LIMITS.THICKNESS_MAX,
      DEFAULT_CONFIG.WIRE_THICKNESS,
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

export function wireSeparationToControlValue(separation: number, thickness: number): number {
  const min = minCenterlineSeparation(thickness);
  const max = WIRE_CONTROL_LIMITS.SEPARATION_MAX;
  if (min >= max) return WIRE_CONTROL_PERCENT_MAX;
  const safeSeparation = clampFinite(separation, min, max, min);
  return roundWireControl(((safeSeparation - min) / (max - min)) * WIRE_CONTROL_PERCENT_MAX);
}

export function wireSeparationFromControlValue(value: number, thickness: number): number {
  const min = minCenterlineSeparation(thickness);
  const max = WIRE_CONTROL_LIMITS.SEPARATION_MAX;
  if (min >= max) return max;
  const percent = clampWireControl(value) / WIRE_CONTROL_PERCENT_MAX;
  return Number((min + percent * (max - min)).toFixed(3));
}

export function wireTwistsToControlValue(
  twists: number,
  thickness: number,
  separation: number,
): number {
  const max = maxSafeWireTwists(thickness, separation);
  if (max <= WIRE_CONTROL_LIMITS.TWISTS_MIN) return WIRE_CONTROL_PERCENT_MIN;
  const safeTwists = clampFinite(twists, WIRE_CONTROL_LIMITS.TWISTS_MIN, max, max);
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
      DEFAULT_CONFIG.WIRE_THICKNESS,
    ),
    WIRE_SEPARATION: clampFinite(
      values.WIRE_SEPARATION,
      WIRE_CONTROL_LIMITS.SEPARATION_MIN,
      WIRE_CONTROL_LIMITS.SEPARATION_MAX,
      DEFAULT_CONFIG.WIRE_SEPARATION,
    ),
    WIRE_TWISTS: Math.round(clampFinite(
      values.WIRE_TWISTS,
      WIRE_CONTROL_LIMITS.TWISTS_MIN,
      WIRE_CONTROL_LIMITS.TWISTS_MAX,
      DEFAULT_CONFIG.WIRE_TWISTS,
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
