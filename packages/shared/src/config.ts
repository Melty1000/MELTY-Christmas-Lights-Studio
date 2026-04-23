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

export const QUALITY_TIERS = ['billboard', 'medium', 'high', 'ultra'] as const;

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

  NUM_PINS: z.number().int().min(2).max(20).default(7),
  SAG_AMPLITUDE: z.number().min(0).max(2).default(0.4),
  LIGHTS_PER_SEGMENT: z.number().int().min(1).max(100).default(3),

  BULB_SCALE: z.number().min(0.1).max(3).default(0.23),
  WIRE_THICKNESS: z.number().min(0).max(0.2).default(0.031),
  WIRE_OFFSET: z.number().min(0).max(1).default(0.02),
  WIRE_SEPARATION: z.number().min(0).max(0.3).default(0.036),
  WIRE_TWISTS: z.number().min(0).max(1000).default(215),

  AMBIENT_INTENSITY: z.number().min(0).max(5).default(1),
  KEY_LIGHT_INTENSITY: z.number().min(0).max(5).default(1.2),
  FILL_LIGHT_INTENSITY: z.number().min(0).max(5).default(0.42),
  HEMI_LIGHT_INTENSITY: z.number().min(0).max(5).default(0.35),

  POSTFX_ENABLED: z.boolean().default(true),
  BLOOM_STRENGTH: z.number().min(0).max(5).default(0.4),
  BLOOM_RADIUS: z.number().min(0).max(2).default(0.1),
  BLOOM_THRESHOLD: z.number().min(0).max(1).default(0.2),
  BLOOM_INTENSITY: z.number().min(0).max(5).default(0.4),

  GLASS_OPACITY: z.number().min(0).max(1).default(0.15),
  GLASS_ROUGHNESS: z.number().min(0).max(1).default(0),
  EMISSIVE_INTENSITY: z.number().min(0).max(20).default(6),
  GLASS_IOR: z.number().min(1).max(3).default(2.5),

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
  CAMERA_HEIGHT: z.number().min(-50).max(50).default(-3),
  CAMERA_X: z.number().min(-50).max(50).default(0),

  TENSION: z.number().min(-1).max(1).default(0),

  QUALITY: z.enum(QUALITY_TIERS).default('medium'),

  BILLBOARD_DEBUG_HIGH_WIRE: z.boolean().default(false),
  USE_WIRE_NETWORK: z.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;
export type ConfigKey = keyof Config;

export const configPatchSchema = configSchema.partial();
export type ConfigPatch = z.infer<typeof configPatchSchema>;

export const DEFAULT_CONFIG: Config = configSchema.parse({});

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
