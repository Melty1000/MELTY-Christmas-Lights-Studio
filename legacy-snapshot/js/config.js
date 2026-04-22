// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                          CONFIGURATION & STORAGE                          ║
// ╠═══════════════════════════════════════════════════════════════════════════╣
// ║  Camera logic moved to camera.js - re-exported below for compatibility   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Re-export camera functions for backwards compatibility
export { REFERENCE_EXTREMES, REFERENCE_RESOLUTION, calculateScaledCamera, updateCameraBase, sliderToOffset, applyFinalPosition } from './camera.js';
import { logInfo, logWarn, logError, logPerf } from './debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: CONFIGURATION PERSISTENCE (save/load/reset)
// ═══════════════════════════════════════════════════════════════════════════════
const CONFIG_STORAGE_KEY = 'christmas_lights_config';

// CONFIG change notification system
const configListeners = new Set();
export function onConfigChange(callback) {
    configListeners.add(callback);
    return () => configListeners.delete(callback); // Returns unsubscribe function
}
export function notifyConfigChange(key, value) {
    configListeners.forEach(callback => callback(key, value));
}

export function saveConfig() {
    try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(CONFIG));
        logInfo('Config', 'Configuration saved to localStorage');
    } catch (e) {
        logWarn('Config', 'Failed to save configuration', { error: e.message });
        logError('Config', 'Failed to save configuration', e);
    }
}

export function loadConfig() {
    logInfo('Config', 'loadConfig() called');
    try {
        const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Validate: only copy keys that exist in CONFIG (prevents pollution from corrupted data)
            for (const key of Object.keys(parsed)) {
                if (key in CONFIG) {
                    CONFIG[key] = parsed[key];
                }
            }
            return true;
        }
    } catch (e) {
        logError('Config', 'Failed to load configuration', e);
    }
    return false;
}

// Validate and clamp CONFIG values to valid ranges
export function validateConfig() {
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    // Numeric bounds validation
    if (typeof CONFIG.NUM_PINS === 'number') CONFIG.NUM_PINS = clamp(CONFIG.NUM_PINS, 2, 20);
    if (typeof CONFIG.LIGHTS_PER_SEGMENT === 'number') CONFIG.LIGHTS_PER_SEGMENT = clamp(CONFIG.LIGHTS_PER_SEGMENT, 1, 100);
    if (typeof CONFIG.BULB_SCALE === 'number') CONFIG.BULB_SCALE = clamp(CONFIG.BULB_SCALE, 0.1, 3.0);
    if (typeof CONFIG.TWINKLE_SPEED === 'number') CONFIG.TWINKLE_SPEED = clamp(CONFIG.TWINKLE_SPEED, 0, 4);
    if (typeof CONFIG.TWINKLE_MIN_INTENSITY === 'number') CONFIG.TWINKLE_MIN_INTENSITY = clamp(CONFIG.TWINKLE_MIN_INTENSITY, 0, 1);
    if (typeof CONFIG.TWINKLE_MAX_INTENSITY === 'number') CONFIG.TWINKLE_MAX_INTENSITY = clamp(CONFIG.TWINKLE_MAX_INTENSITY, 0, 1);
    if (typeof CONFIG.BLOOM_STRENGTH === 'number') CONFIG.BLOOM_STRENGTH = clamp(CONFIG.BLOOM_STRENGTH, 0, 5);
    if (typeof CONFIG.SNOW_COUNT === 'number') CONFIG.SNOW_COUNT = clamp(CONFIG.SNOW_COUNT, 0, 2000);
    if (typeof CONFIG.STARS_COUNT === 'number') CONFIG.STARS_COUNT = clamp(CONFIG.STARS_COUNT, 0, 2000);

    // Boolean type enforcement
    const booleanKeys = ['STARS_ENABLED', 'SNOW_ENABLED', 'BACKGROUND_ENABLED',
        'POINT_LIGHTS_ENABLED', 'ANTIALIAS_ENABLED', 'STATS_ENABLED'];
    booleanKeys.forEach(key => {
        if (key in CONFIG && typeof CONFIG[key] !== 'boolean') {
            CONFIG[key] = Boolean(CONFIG[key]);
        }
    });

    // Migrate old COLOR_CYCLING_ENABLED to ANIMATION_STYLE
    if ('COLOR_CYCLING_ENABLED' in CONFIG) {
        if (CONFIG.COLOR_CYCLING_ENABLED === true) {
            CONFIG.ANIMATION_STYLE = 'SOFT_TWINKLE';
        } else {
            CONFIG.ANIMATION_STYLE = 'STATIC';
        }
        delete CONFIG.COLOR_CYCLING_ENABLED;
    }
    // Migrate old COLOR_CYCLE_MODE to ANIMATION_STYLE
    if ('COLOR_CYCLE_MODE' in CONFIG) {
        const modeMap = { 'OFF': 'STATIC', 'ON_DIM': 'SOFT_TWINKLE', 'TIMED': 'COLOR_FADE' };
        CONFIG.ANIMATION_STYLE = modeMap[CONFIG.COLOR_CYCLE_MODE] || 'SOFT_TWINKLE';
        delete CONFIG.COLOR_CYCLE_MODE;
    }
    // Remove deprecated settings
    delete CONFIG.COLOR_CYCLE_SPEED;
    delete CONFIG.TWINKLE_RANDOMNESS;
    delete CONFIG.AVOID_ADJACENT_COLORS;

    // Validate ANIMATION_STYLE
    const validStyles = ['STATIC', 'SOFT_TWINKLE', 'ALTERNATING', 'CHASE', 'RANDOM_SPARKLE', 'COLOR_FADE', 'PARTY'];
    if (!validStyles.includes(CONFIG.ANIMATION_STYLE)) {
        CONFIG.ANIMATION_STYLE = 'SOFT_TWINKLE';
    }

    // Theme migration: map deleted themes to their consolidated replacements
    const themeMigration = {
        'ARCTIC': 'ICY',
        'NEON_NIGHTS': 'CYBERPUNK',
        'MONOCHROME_GREEN': 'FOREST',
        'COOL_OCEAN': 'OCEAN',
        'MONOCHROME_BLUE': 'OCEAN',
        'COTTON_CANDY': 'PASTEL_DREAM',
        'MONOCHROME_RED': 'FIRE'
    };
    if (CONFIG.ACTIVE_THEME && themeMigration[CONFIG.ACTIVE_THEME]) {
        CONFIG.ACTIVE_THEME = themeMigration[CONFIG.ACTIVE_THEME];
    }
}

export function resetConfig() {
    const defaults = {
        ANIMATION_STYLE: 'SOFT_TWINKLE',
        STARS_ENABLED: false,
        SNOW_ENABLED: false,
        BACKGROUND_ENABLED: false,
        POINT_LIGHTS_ENABLED: false,
        ACTIVE_THEME: 'GHOST',
        WIRE_THEME: 'SILVER',
        SOCKET_THEME: 'WIRE_MATCH',
        NUM_PINS: 7,
        SAG_AMPLITUDE: 0.4,
        LIGHTS_PER_SEGMENT: 3,
        BULB_SCALE: 0.23,
        WIRE_THICKNESS: 0.031,
        WIRE_OFFSET: 0.02,
        WIRE_SEPARATION: 0.036,
        WIRE_TWISTS: 215,
        TENSION: 0,
        POSTFX_ENABLED: true,
        BLOOM_STRENGTH: 0.4,
        BLOOM_RADIUS: 0.1,
        BLOOM_THRESHOLD: 0.2,
        BLOOM_INTENSITY: 0.4,
        GLASS_OPACITY: 0.15,
        GLASS_ROUGHNESS: 0,
        EMISSIVE_INTENSITY: 6,
        GLASS_IOR: 2.5,
        ANIMATION_SPEED: 0,
        SWAY_X: 0,
        SWAY_Z: 0,
        TWINKLE_SPEED: 1,
        TWINKLE_MIN_INTENSITY: 0,
        TWINKLE_MAX_INTENSITY: 1,
        TWINKLE_RANDOMNESS: 0,
        SNOW_COUNT: 100,
        SNOW_SPEED: 0.005,
        SNOW_SIZE: 0.01,
        SNOW_DRIFT: 0,
        STARS_COUNT: 100,
        STARS_SIZE: 0.1,
        STARS_OPACITY: 0.1,
        STARS_TWINKLE_SPEED: 0,
        CAMERA_DISTANCE: 22,
        CAMERA_HEIGHT: -3,
        CAMERA_X: 0,
        AMBIENT_INTENSITY: 1,
        ANTIALIAS_ENABLED: true,
        QUALITY: 'medium'
    };
    Object.assign(CONFIG, defaults);
    saveConfig();
    return defaults;
}


// ─────────────────────────────────────────────────────────────────────────
//  SECTION 1.1: PRESET PREFERENCES STORAGE
// ─────────────────────────────────────────────────────────────────────────
export let presetPreferences = {};
try {
    const saved = localStorage.getItem('presetPreferences');
    presetPreferences = saved ? JSON.parse(saved) : {
        classic: { snowEnabled: false, starsEnabled: false },
        party: { snowEnabled: false, starsEnabled: false },
        candy: { snowEnabled: false, starsEnabled: false },
        vintage: { snowEnabled: false, starsEnabled: false },
        winter: { snowEnabled: true, starsEnabled: true }
    };
} catch (e) {
    logWarn('Config', 'Failed to load preset preferences');
    presetPreferences = {
        classic: { snowEnabled: false, starsEnabled: false },
        party: { snowEnabled: false, starsEnabled: false },
        candy: { snowEnabled: false, starsEnabled: false },
        vintage: { snowEnabled: false, starsEnabled: false },
        winter: { snowEnabled: true, starsEnabled: true }
    };
}

export function savePresetPreferences() {
    try {
        localStorage.setItem('presetPreferences', JSON.stringify(presetPreferences));
    } catch (e) {
        logWarn('Config', 'Failed to save preset preferences');
    }
}

export let currentPresetName = localStorage.getItem('christmas_lights_preset_name') || null;

export function getCurrentPresetName() {
    return currentPresetName;
}

export function setCurrentPresetName(name) {
    currentPresetName = name;
    try {
        if (name) {
            localStorage.setItem('christmas_lights_preset_name', name);
        } else {
            localStorage.removeItem('christmas_lights_preset_name');
        }
    } catch (e) {
        // Ignore localStorage errors
    }
}


// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                   SECTION 2: CONSTANTS & THEMES                           ║
// ║                 CONFIG object, THEMES, WIRE_THEMES, textures              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// =========================================
//  --- MASTER CONFIGURATION ---
// =========================================
export const CONFIG = {
    // --- ANIMATION STYLE ---
    // 'STATIC' | 'SOFT_TWINKLE' | 'ALTERNATING' | 'CHASE' | 'RANDOM_SPARKLE' | 'COLOR_FADE' | 'PARTY'
    ANIMATION_STYLE: 'SOFT_TWINKLE',

    // --- FEATURE TOGGLES ---
    STARS_ENABLED: false,
    SNOW_ENABLED: false,
    BACKGROUND_ENABLED: false,
    POINT_LIGHTS_ENABLED: false,
    ANTIALIAS_ENABLED: true,
    STATS_ENABLED: false,

    // --- THEME SELECTION ---
    ACTIVE_THEME: 'GHOST',
    WIRE_THEME: 'SILVER',
    SOCKET_THEME: 'WIRE_MATCH',

    // --- GEOMETRY SETTINGS ---
    NUM_PINS: 7,
    SAG_AMPLITUDE: 0.4,
    LIGHTS_PER_SEGMENT: 3,

    BULB_SCALE: 0.23,
    WIRE_THICKNESS: 0.031,
    WIRE_OFFSET: 0.02,
    WIRE_SEPARATION: 0.036,
    WIRE_TWISTS: 215,

    // --- LIGHTING ---
    AMBIENT_INTENSITY: 1,

    // --- POST-FX (Bloom) ---
    POSTFX_ENABLED: true,
    BLOOM_STRENGTH: 0.4,
    BLOOM_RADIUS: 0.1,
    BLOOM_THRESHOLD: 0.2,
    BLOOM_INTENSITY: 0.4,

    // --- GLASS PROPERTIES ---
    GLASS_OPACITY: 0.15,
    GLASS_ROUGHNESS: 0,
    EMISSIVE_INTENSITY: 6,
    GLASS_IOR: 2.5,

    // --- ANIMATION ---
    ANIMATION_SPEED: 0,
    SWAY_X: 0,
    SWAY_Z: 0,

    // --- TWINKLE ---
    TWINKLE_SPEED: 1,
    TWINKLE_MIN_INTENSITY: 0,
    TWINKLE_MAX_INTENSITY: 1,
    TWINKLE_RANDOMNESS: 0,

    // --- SNOW ---
    SNOW_COUNT: 100,
    SNOW_SPEED: 0.005,
    SNOW_SIZE: 0.01,
    SNOW_DRIFT: 0,

    // --- STARS ---
    STARS_COUNT: 100,
    STARS_SIZE: 0.1,
    STARS_OPACITY: 0.1,
    STARS_TWINKLE_SPEED: 0,

    // --- CAMERA ---
    CAMERA_DISTANCE: 22,
    CAMERA_HEIGHT: -3,
    CAMERA_X: 0,

    // --- PHYSICS ---
    TENSION: 0,

    // --- QUALITY ---
    QUALITY: 'medium',

    // --- DEBUG / DEVELOPMENT ---
    BILLBOARD_DEBUG_HIGH_WIRE: false,  // When true, billboard mode uses high quality wires for debugging

    // --- EXPERIMENTAL FEATURES ---
    USE_WIRE_NETWORK: false  // NEW: When true, uses WireNetwork for socket-top positioning (eliminates dip)
};

// =========================================
//  --- COLOR THEMES ---
// =========================================
export const THEMES = {
    'CANDY_CANE': { bulbs: [0xff0000, 0xffffff] },
    'CHRISTMAS': { bulbs: [0x00aa00, 0xff0000] },
    'CLASSIC': { bulbs: [0xff0000, 0x00aa00, 0x0000ff, 0xffa500, 0xffffff] },
    'CYBERPUNK': { bulbs: [0xff00ff, 0x00ffff, 0xff0080, 0xffff00, 0x00ff00] },
    'FANTASY': { bulbs: [0x9370db, 0x20b2aa, 0x32cd32, 0x87ceeb] },
    'FIRE': { bulbs: [0xb22222, 0xdc143c, 0xff0000, 0xff4500, 0xff6347, 0xffa500, 0xffff00] },
    'FOREST': { bulbs: [0x228b22, 0x2e8b57, 0x32cd32, 0x3cb371] },
    'GHOST': { bulbs: [0xffffff, 0xe0e0e0, 0xc0c0c0] },
    'GOLD_RUSH': { bulbs: [0xffd700, 0xdaa520, 0xd4a520, 0xff8c00] },
    'HALLOWEEN': { bulbs: [0xff8c00, 0x9932cc] },
    'ICY': { bulbs: [0xffffff, 0xe0f7ff, 0xd0f0ff, 0x87ceeb, 0x4682b4] },
    'LAVENDER': { bulbs: [0xe6e6fa, 0xd8bfd8, 0xdda0dd, 0xba55d3] },
    'MINT': { bulbs: [0x98ff98, 0xaaffaa, 0x90ee90, 0xb0ffb0] },
    'OCEAN': { bulbs: [0x0077be, 0x4169e1, 0x1e90ff, 0x40e0d0, 0x00bfff, 0x87ceeb] },
    'PASTEL_DREAM': { bulbs: [0xffb3d9, 0xffb3de, 0xffc0cb, 0xffe4b5, 0xfffacd, 0xadd8e6, 0xb0e0e6, 0xe6e6fa] },
    'PEACH': { bulbs: [0xffdab9, 0xffb3a7, 0xff9980, 0xff8566] },
    'RAINBOW': { bulbs: [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff, 0x9400d3] },
    'ROYAL': { bulbs: [0x4b0082, 0x6a5acd, 0x9370db, 0xffd700] },
    'TROPICAL': { bulbs: [0xff1493, 0xff69b4, 0x00ced1, 0x7fff00, 0xffff00] },
    'VAPORWAVE': { bulbs: [0xff00ff, 0x00ffff, 0xff1493, 0x9400d3] },
    'VINTAGE': { bulbs: [0x8b7355, 0xa0826d, 0xbc9b6a, 0xd2b48c] },
    'WARM_SUNSET': { bulbs: [0xff4500, 0xff6347, 0xff8c00, 0xffa500] }
};

export const WIRE_THEMES = {
    'BLACK': { A: 0x0a0a0a, B: 0x1a1a1a },
    'CANDY_CANE': { A: 0xff0000, B: 0xffffff },
    'CHRISTMAS': { A: 0x006600, B: 0x880000 },
    'COPPER': { A: 0xcd7f32, B: 0xeda76a },  // Bright polished copper
    'FIRE': { A: 0x8b0000, B: 0xff4500 },    // Matches FIRE bulb theme
    'FOREST': { A: 0x228b22, B: 0x32cd32 },  // Matches FOREST bulb theme
    'GOLD': { A: 0xdaa520, B: 0xffd700 },    // Bright shiny gold
    'HALLOWEEN': { A: 0xff6600, B: 0x9933ff },  // Orange and purple
    'ICY': { A: 0x2233aa, B: 0x87ceeb },     // Matches ICY bulb theme
    'MINT': { A: 0x20b2aa, B: 0x66cdaa },    // Seafoam colors
    'OCEAN': { A: 0x0077be, B: 0x40e0d0 },   // Matches OCEAN bulb theme
    'ORANGE': { A: 0xff6347, B: 0xff8c00 },
    'PINK': { A: 0xff69b4, B: 0xffb6c1 },
    'PURPLE': { A: 0x4b0082, B: 0x663399 },
    'SILVER': { A: 0xc0c0c0, B: 0xf0f0f0 },  // Bright shiny silver
    'TEAL': { A: 0x008080, B: 0x20b2aa },
    'WHITE': { A: 0xf5f5f5, B: 0xffffff },
    'YELLOW': { A: 0xffd700, B: 0xffff00 }
};

export const SOCKET_THEMES = {
    'WIRE_MATCH': null,      // Use wire color (default behavior)
    'GOLD': 0xFFD700,
    'SILVER': 0xC0C0C0,
    'COPPER': 0xB87333
};

// Metal themes that receive sparkle/shimmer effect
export const METAL_THEMES = {
    WIRE: ['COPPER', 'GOLD', 'SILVER'],
    SOCKET: ['COPPER', 'GOLD', 'SILVER']
};

// Expose CONFIG to window for DevTools debugging
window.CONFIG = CONFIG;
