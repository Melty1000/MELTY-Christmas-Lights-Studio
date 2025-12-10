// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    SECTION 1: CONFIGURATION & STORAGE                     ║
// ║                   Config persistence, presets, camera system              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// =========================================
//  --- CONFIGURATION PERSISTENCE ---
// =========================================
const CONFIG_STORAGE_KEY = 'christmas_lights_config';

export function saveConfig() {
    try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(CONFIG));
        console.log('Configuration saved');
    } catch (e) {
        console.error('Failed to save configuration:', e);
    }
}

export function loadConfig() {
    try {
        const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(CONFIG, parsed);
            console.log('Configuration loaded');
            return true;
        }
    } catch (e) {
        console.error('Failed to load configuration:', e);
    }
    return false;
}

export function resetConfig() {
    const defaults = {
        COLOR_CYCLING_ENABLED: true,
        STARS_ENABLED: false,
        SNOW_ENABLED: false,
        BACKGROUND_ENABLED: false,
        AVOID_ADJACENT_COLORS: false,
        SHADOWS_ENABLED: false,
        ACTIVE_THEME: 'CHRISTMAS',
        WIRE_THEME: 'CHRISTMAS_PAIR',
        NUM_PINS: 7,
        SAG_AMPLITUDE: 0.5,
        LIGHTS_PER_SEGMENT: 1,
        BULB_SCALE: 0.08,
        WIRE_THICKNESS: 0.017,
        WIRE_OFFSET: 0.02,
        WIRE_SEPARATION: 0.02,
        WIRE_TWISTS: 120,
        AMBIENT_INTENSITY: 0.8,
        GLASS_OPACITY: 0.25,
        GLASS_ROUGHNESS: 1.0,
        EMISSIVE_INTENSITY: 0.0,
        GLASS_IOR: 2.5,
        ANIMATION_SPEED: 0.6,
        SWAY_AMOUNT: 0.1,
        TWINKLE_SPEED: 0.03,
        TWINKLE_MIN_INTENSITY: 0.0,
        TWINKLE_RANDOMNESS: 2.0,
        SNOW_COUNT: 3000,
        SNOW_SPEED: 0.005,
        SNOW_SIZE: 0.02,
        SNOW_DRIFT: 0.01,
        CAMERA_DISTANCE: 14,
        CAMERA_HEIGHT: -0.5,
        TENSION: 0.0,
        QUALITY: 'high'
    };
    Object.assign(CONFIG, defaults);
    saveConfig();
    return defaults;
}

// =========================================
//  PRESET PREFERENCES STORAGE
// =========================================
export let presetPreferences = {};
try {
    const saved = localStorage.getItem('presetPreferences');
    presetPreferences = saved ? JSON.parse(saved) : {
        classic: { snowEnabled: false, starsEnabled: false },
        party: { snowEnabled: false, starsEnabled: false },
        neon: { snowEnabled: false, starsEnabled: false },
        vintage: { snowEnabled: false, starsEnabled: false },
        winter: { snowEnabled: true, starsEnabled: true }
    };
} catch (e) {
    console.warn('Failed to load preset preferences');
    presetPreferences = {
        classic: { snowEnabled: false, starsEnabled: false },
        party: { snowEnabled: false, starsEnabled: false },
        neon: { snowEnabled: false, starsEnabled: false },
        vintage: { snowEnabled: false, starsEnabled: false },
        winter: { snowEnabled: true, starsEnabled: true }
    };
}

export function savePresetPreferences() {
    try {
        localStorage.setItem('presetPreferences', JSON.stringify(presetPreferences));
    } catch (e) {
        console.warn('Failed to save preset preferences');
    }
}

export let currentPresetName = null;

export function getCurrentPresetName() {
    return currentPresetName;
}


// =========================================
//  BASE+OFFSET CAMERA SYSTEM
// =========================================
// Reference extremes at 1920x1080 (placeholder values - user can adjust later)
export const REFERENCE_EXTREMES = {
    distance: { min: 8, max: 50 },     // Placeholder: will be user-tested
    height: { min: -15, max: 24 },     // USER TESTED
    pan: { min: -25, max: 25 }         // Placeholder: will be user-tested
};

export const REFERENCE_RESOLUTION = {
    width: 1920,
    height: 1080,
    aspect: 1920 / 1080
};

// Camera state (global)
if (typeof window !== 'undefined') {
    window.cameraBase = { distance: 0, height: 0, pan: 0 };
    window.cameraOffset = { distance: 0, height: 0, pan: 0 };
    window.cameraExtremes = {
        distance: { min: 0, max: 0 },
        height: { min: 0, max: 0 },
        pan: { min: 0, max: 0 }
    };
}

// Calculate camera base position using visible bounds math
export function calculateScaledCamera(cameraData) {
    if (!cameraData) return { distance: 14, height: 0, pan: 0 };

    const currentAspect = window.innerWidth / window.innerHeight;
    const fov = 40; // degrees
    const tanFov = Math.tan((fov * Math.PI / 180) / 2);

    const aspectRatio = currentAspect / (cameraData.refAspect || REFERENCE_RESOLUTION.aspect);
    let targetDistance;

    if (currentAspect >= (cameraData.refAspect || REFERENCE_RESOLUTION.aspect)) {
        // Wider: preserve vertical framing
        const refVisibleHeight = cameraData.refVisibleHeight || (2 * tanFov * cameraData.distance);
        targetDistance = refVisibleHeight / (2 * tanFov);
    } else {
        // Narrower: preserve horizontal framing with blend for extremes
        const BLEND_END = 0.75;
        const refVisibleHeight = cameraData.refVisibleHeight || (2 * tanFov * cameraData.distance);
        const refVisibleWidth = cameraData.refVisibleWidth || (refVisibleHeight * (cameraData.refAspect || REFERENCE_RESOLUTION.aspect));

        if (aspectRatio < BLEND_END) {
            // Blend between width and height preservation
            const widthDistance = (refVisibleWidth / currentAspect) / (2 * tanFov);
            const heightDistance = refVisibleHeight / (2 * tanFov);
            const blendFactor = (BLEND_END - aspectRatio) / BLEND_END;
            targetDistance = widthDistance * (1 - blendFactor) + heightDistance * blendFactor;
        } else {
            // Normal: preserve width
            targetDistance = (refVisibleWidth / currentAspect) / (2 * tanFov);
        }
    }

    // Proportional scaling for height/pan
    const scale = targetDistance / cameraData.distance;

    return {
        distance: targetDistance,
        height: cameraData.height * scale,
        pan: (cameraData.pan || 0) * scale
    };
}

// Update camera base and extremes
export function updateCameraBase() {
    const scaled = calculateScaledCamera(window.lastLoadedCameraData);
    window.cameraBase.distance = scaled.distance;
    window.cameraBase.height = scaled.height;
    window.cameraBase.pan = scaled.pan;

    // Calculate scaled extremes
    const scaleFactor = window.cameraBase.distance / (window.lastLoadedCameraData?.distance || 14);
    window.cameraExtremes.distance.min = REFERENCE_EXTREMES.distance.min * scaleFactor;
    window.cameraExtremes.distance.max = REFERENCE_EXTREMES.distance.max * scaleFactor;
    window.cameraExtremes.height.min = REFERENCE_EXTREMES.height.min * scaleFactor;
    window.cameraExtremes.height.max = REFERENCE_EXTREMES.height.max * scaleFactor;
    window.cameraExtremes.pan.min = REFERENCE_EXTREMES.pan.min * scaleFactor;
    window.cameraExtremes.pan.max = REFERENCE_EXTREMES.pan.max * scaleFactor;
}

// Convert slider value (0-100) to camera offset
export function sliderToOffset(sliderValue, extremes) {
    const normalized = (sliderValue - 50) / 50; // -1 to +1
    const range = extremes.max - extremes.min;
    return (normalized * range) / 2;
}

// Apply final camera position (base + offset)
export function applyFinalPosition(camera, renderer, scene) {
    CONFIG.CAMERA_DISTANCE = window.cameraBase.distance + window.cameraOffset.distance;
    CONFIG.CAMERA_HEIGHT = window.cameraBase.height + window.cameraOffset.height;
    CONFIG.CAMERA_X = window.cameraBase.pan + window.cameraOffset.pan;

    if (camera) {
        camera.position.z = CONFIG.CAMERA_DISTANCE;
        camera.position.y = CONFIG.CAMERA_HEIGHT;
        camera.position.x = CONFIG.CAMERA_X;

        if (renderer && scene) {
            renderer.render(scene, camera);
        }
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
    // --- FEATURE TOGGLES ---
    COLOR_CYCLING_ENABLED: true,
    STARS_ENABLED: false,
    SNOW_ENABLED: false,
    BACKGROUND_ENABLED: false,
    AVOID_ADJACENT_COLORS: false,
    SHADOWS_ENABLED: false,

    // --- THEME SELECTION ---
    ACTIVE_THEME: 'CHRISTMAS',
    WIRE_THEME: 'CHRISTMAS_PAIR',

    // --- GEOMETRY SETTINGS ---
    NUM_PINS: 7,
    SAG_AMPLITUDE: 0.5,
    LIGHTS_PER_SEGMENT: 1,

    BULB_SCALE: 0.08,
    WIRE_THICKNESS: 0.017,
    WIRE_OFFSET: 0.02,
    WIRE_SEPARATION: 0.02,
    WIRE_TWISTS: 120,

    // --- LIGHTING ---
    AMBIENT_INTENSITY: 0.8,

    // --- POST-FX (Triple-Scene Bloom) ---
    POSTFX_ENABLED: true,

    // Filament Bloom (tight, intense core glow)
    BLOOM_STRENGTH_FILAMENT: 2.5,
    BLOOM_RADIUS_FILAMENT: 0.5,
    BLOOM_THRESHOLD_FILAMENT: 0.0,
    BLOOM_INTENSITY_FILAMENT: 1.2,

    // Glass Glow (wide, soft colored halos)
    BLOOM_STRENGTH_GLASS: 1.5,
    BLOOM_RADIUS_GLASS: 1.2,
    BLOOM_THRESHOLD_GLASS: 0.0,
    BLOOM_INTENSITY_GLASS: 0.8,
    GLASS_GLOW_ENABLED: true,

    // Composite (tone mapping, color grading)
    EXPOSURE: 1.0,
    CONTRAST: 1.05,
    SATURATION: 1.1,

    // --- GLASS PROPERTIES ---
    GLASS_OPACITY: 0.25,
    GLASS_ROUGHNESS: 0.3,   // Lowered from 1.0 to enable glass transmission for bloom
    EMISSIVE_INTENSITY: 1.5, // Raised from 0.0 to enable filament bloom clones
    GLASS_IOR: 2.5,

    // --- ANIMATION ---
    ANIMATION_SPEED: 0.6,
    SWAY_X: 0.02,
    SWAY_Z: 0.1,

    // --- TWINKLE ---
    TWINKLE_SPEED: 0.03,
    TWINKLE_MIN_INTENSITY: 0.0,
    TWINKLE_RANDOMNESS: 2.0,

    // --- SNOW ---
    SNOW_COUNT: 100,
    SNOW_SPEED: 0.005,
    SNOW_SIZE: 0.01,
    SNOW_DRIFT: 0.0,

    // --- STARS ---
    STARS_COUNT: 100,
    STARS_SIZE: 0.1,
    STARS_OPACITY: 0.1,
    STARS_TWINKLE_SPEED: 0.0,

    // --- CAMERA ---
    CAMERA_DISTANCE: 14,
    CAMERA_HEIGHT: -0.5,

    // --- PHYSICS ---
    TENSION: 0.0,

    // --- QUALITY ---
    QUALITY: 'high'
};

// =========================================
//  --- COLOR THEMES ---
// =========================================
export const THEMES = {
    'CHRISTMAS': { bulbs: [0x00aa00, 0xff0000] },
    'ICY': { bulbs: [0xe0f7ff, 0x87ceeb, 0x4682b4] },
    'CANDY_CANE': { bulbs: [0xff0000, 0xffffff] },
    'FANTASY': { bulbs: [0x9370db, 0x20b2aa, 0x32cd32, 0x87ceeb] },
    'CLASSIC': { bulbs: [0xff0000, 0x00aa00, 0x0000ff, 0xffa500, 0xffffff] },
    'HALLOWEEN': { bulbs: [0xff8c00, 0x9932cc, 0x000000] },
    'GHOST': { bulbs: [0xffffff, 0xe0e0e0, 0xc0c0c0] },
    'VAPORWAVE': { bulbs: [0xff00ff, 0x00ffff, 0xff1493, 0x9400d3] },
    'WARM_SUNSET': { bulbs: [0xff4500, 0xff6347, 0xff8c00, 0xffa500] },
    'COOL_OCEAN': { bulbs: [0x4169e1, 0x1e90ff, 0x00bfff, 0x87ceeb] },
    'PASTEL_DREAM': { bulbs: [0xffb3de, 0xffe4b5, 0xfffacd, 0xb0e0e6, 0xe6e6fa] },
    'NEON_NIGHTS': { bulbs: [0xff0080, 0x00ff00, 0xffff00, 0x00ffff, 0xff00ff] },
    'FOREST': { bulbs: [0x228b22, 0x2e8b57, 0x3cb371, 0x90ee90] },
    'FIRE': { bulbs: [0xff0000, 0xff4500, 0xff6347, 0xffa500, 0xffff00] },
    'ROYAL': { bulbs: [0x4b0082, 0x6a5acd, 0x9370db, 0xffd700] },
    'VINTAGE': { bulbs: [0x8b7355, 0xa0826d, 0xbc9b6a, 0xd2b48c] },
    'COTTON_CANDY': { bulbs: [0xffb3d9, 0xffc0cb, 0xadd8e6, 0xb0e0e6] },
    'ARCTIC': { bulbs: [0xffffff, 0xf0ffff, 0xe0ffff, 0xd0f0ff] },
    'RAINBOW': { bulbs: [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x0000ff, 0x9400d3] },
    'MINT': { bulbs: [0x98ff98, 0xaaffaa, 0x90ee90, 0xb0ffb0] },
    'PEACH': { bulbs: [0xffdab9, 0xffb3a7, 0xff9980, 0xff8566] },
    'LAVENDER': { bulbs: [0xe6e6fa, 0xd8bfd8, 0xdda0dd, 0xba55d3] },
    'GOLD_RUSH': { bulbs: [0xffd700, 0xdaa520, 0xb8860b, 0xff8c00] },
    'MONOCHROME_RED': { bulbs: [0x8b0000, 0xb22222, 0xdc143c, 0xff6347] },
    'MONOCHROME_BLUE': { bulbs: [0x191970, 0x0000cd, 0x4169e1, 0x6495ed] },
    'MONOCHROME_GREEN': { bulbs: [0x006400, 0x228b22, 0x32cd32, 0x90ee90] },
    'TROPICAL': { bulbs: [0xff1493, 0xff69b4, 0x00ced1, 0x7fff00, 0xffff00] },
    'CYBERPUNK': { bulbs: [0xff00ff, 0x00ffff, 0xff0080, 0xffff00, 0x00ff00] }
};

export const WIRE_THEMES = {
    'CHRISTMAS_PAIR': { A: 0x006600, B: 0x880000 },
    'BLACK_PAIR': { A: 0x0a0a0a, B: 0x1a1a1a },
    'SILVER_PAIR': { A: 0xaaaaaa, B: 0xdddddd },
    'WHITE_PAIR': { A: 0xf5f5f5, B: 0xffffff },
    'HALLOWEEN_PAIR': { A: 0x0a0a0a, B: 0xff8800 },
    'ICY_BLUE': { A: 0x2233aa, B: 0x00cccc },
    'COPPER': { A: 0xb87333, B: 0xd4a574 },
    'BRONZE': { A: 0x8c7853, B: 0xcd7f32 },
    'GOLD': { A: 0xb8860b, B: 0xffd700 },
    'ROSE_GOLD': { A: 0xb76e79, B: 0xe0bfb8 },
    'BROWN': { A: 0x654321, B: 0x8b4513 },
    'DARK_GREEN': { A: 0x013220, B: 0x0f5132 },
    'NAVY': { A: 0x000080, B: 0x191970 },
    'PURPLE': { A: 0x4b0082, B: 0x663399 },
    'PINK': { A: 0xff69b4, B: 0xffb6c1 },
    'ORANGE': { A: 0xff6347, B: 0xff8c00 },
    'YELLOW': { A: 0xffd700, B: 0xffff00 },
    'TEAL': { A: 0x008080, B: 0x20b2aa },
    'RED': { A: 0x8b0000, B: 0xff0000 },
    'BLUE': { A: 0x00008b, B: 0x4169e1 },
    'GREEN': { A: 0x006400, B: 0x00ff00 },
    'RAINBOW': { A: 0xff0000, B: 0x00ff00 }
};


