// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                            UI & EVENT HANDLERS                            ║
// ╠═══════════════════════════════════════════════════════════════════════════╣
// ║  Imports from ui/ folder:                                                 ║
// ║    - CustomDropdown from ui/dropdown.js                                   ║
// ║    - PRESETS, KEY_MAP, REVERSE_KEY_MAP from ui/presets.js                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import { CONFIG, THEMES, WIRE_THEMES, SOCKET_THEMES, saveConfig, resetConfig, presetPreferences, savePresetPreferences, getCurrentPresetName, setCurrentPresetName, updateCameraBase, REFERENCE_RESOLUTION } from './config.js';
import { updateSliderFill, showToast, customPrompt, customTextarea, customAlert, customConfirm, initProximityHover, safeSetItem } from './utils.js';
import { initScene } from './renderer.js';
import { initTutorial } from './tutorial.js';
import { setAutoUpdateEnabled, isAutoUpdateEnabled } from './auto-update.js';

// Import from ui/ folder
import { CustomDropdown } from './ui/dropdown.js';
import { PRESETS, KEY_MAP, REVERSE_KEY_MAP } from './ui/presets.js';
import { logUser, logInfo, logPerf, logWarn, logError, startTimer, endTimer } from './debug.js';

// Re-export CustomDropdown for backwards compatibility
export { CustomDropdown };


// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 2: UI BINDING & CONTROLS (setupUI)
// ═══════════════════════════════════════════════════════════════════════════════

let uiInitialized = false;
let themeDropdown, wireDropdown, socketDropdown, animationStyleDropdown;
// currentPresetName is declared in config.js

export function setupUI() {
    if (uiInitialized) {
        logWarn('UI', 'setupUI() already called, skipping duplicate initialization');
        return;
    }

    if (document.body.dataset.uiInitialized === 'true') {
        logError('UI', 'setupUI() called but body already marked as initialized!');
        return;
    }

    uiInitialized = true;
    document.body.dataset.uiInitialized = 'true';

    const themeSelect = document.getElementById('theme-select');
    const wireSelect = document.getElementById('wire-select');
    const socketSelect = document.getElementById('socket-select');

    // Populate dropdowns
    Object.keys(THEMES).forEach(key => {
        const option = new Option(key.replace(/_/g, ' '), key);
        themeSelect.add(option);
        if (key === CONFIG.ACTIVE_THEME) option.selected = true;
    });

    Object.keys(WIRE_THEMES).forEach(key => {
        const option = new Option(key.replace(/_/g, ' '), key);
        wireSelect.add(option);
        if (key === CONFIG.WIRE_THEME) option.selected = true;
    });

    Object.keys(SOCKET_THEMES).forEach(key => {
        const option = new Option(key.replace(/_/g, ' '), key);
        socketSelect.add(option);
        if (key === CONFIG.SOCKET_THEME) option.selected = true;
    });

    // Theme Select
    if (themeSelect) {
        themeDropdown = new CustomDropdown(themeSelect, (value) => {
            CONFIG.ACTIVE_THEME = value;
            applyChanges();
        });
    }

    // Wire Select
    if (wireSelect) {
        wireDropdown = new CustomDropdown(wireSelect, (value) => {
            CONFIG.WIRE_THEME = value;
            applyChanges();
        });
    }

    // Socket Select
    if (socketSelect) {
        socketDropdown = new CustomDropdown(socketSelect, (value) => {
            CONFIG.SOCKET_THEME = value;
            applyChanges();
        });
    }

    // Animation Style Select
    const animationStyleSelect = document.getElementById('animation-style-select');

    if (animationStyleSelect) {
        animationStyleDropdown = new CustomDropdown(animationStyleSelect, (value) => {
            CONFIG.ANIMATION_STYLE = value;
        });
    }

    // Expose dropdowns for tutorial to animate
    window.dropdowns = {
        'theme-select': themeDropdown,
        'wire-select': wireDropdown,
        'socket-select': socketDropdown,
        'animation-style-select': animationStyleDropdown
    };

    // Sync all dropdowns with CONFIG values (silent to avoid re-setting CONFIG)
    if (themeDropdown) themeDropdown.setValueSilent(CONFIG.ACTIVE_THEME);
    if (wireDropdown) wireDropdown.setValueSilent(CONFIG.WIRE_THEME);
    if (socketDropdown) socketDropdown.setValueSilent(CONFIG.SOCKET_THEME);
    if (animationStyleDropdown) animationStyleDropdown.setValueSilent(CONFIG.ANIMATION_STYLE);

    // Quality Slider
    const qualitySlider = document.getElementById('quality-slider');
    const qualityLabel = document.getElementById('quality-label-text');
    const qualityMap = ['billboard', 'medium', 'high', 'ultra'];  // billboard replaces low
    const qualityDisplayMap = ['Low', 'Medium', 'High', 'Ultra High'];

    if (qualitySlider) {
        const currentIdx = qualityMap.indexOf(CONFIG.QUALITY);
        qualitySlider.value = currentIdx !== -1 ? currentIdx : 2;
        if (qualityLabel && currentIdx !== -1) qualityLabel.textContent = qualityDisplayMap[currentIdx];
        if (qualityLabel && currentIdx === -1) qualityLabel.textContent = 'High';

        updateSliderFill(qualitySlider);

        qualitySlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            const qualityStr = qualityMap[val];

            if (qualityStr === 'ultra' && CONFIG.QUALITY !== 'ultra') {
                showToast('Ultra Mode Enabled: High GPU Usage', 'warning', 5000);
            }

            CONFIG.QUALITY = qualityStr;

            if (qualityLabel) {
                qualityLabel.textContent = qualityDisplayMap[val];
            }
            updateSliderFill(e.target);
        });
    }

    // Function to toggle twinkle-related controls when speed is 0
    function updateTwinkleMode() {
        const isTwinkleOff = CONFIG.TWINKLE_SPEED < 0.001;
        const randomnessGroup = document.getElementById('randomness-group');
        const randomnessSlider = document.getElementById('randomness-slider');
        const minBrightnessSlider = document.getElementById('min-brightness-slider');
        const minBrightnessGroup = minBrightnessSlider ? minBrightnessSlider.closest('.setting-group') : null;

        if (isTwinkleOff) {
            // Disable randomness when twinkle is off
            if (randomnessGroup) randomnessGroup.classList.add('disabled');
            if (randomnessSlider) randomnessSlider.disabled = true;
            // Grey out min brightness (brightness is defined by max when twinkle is off)
            if (minBrightnessGroup) minBrightnessGroup.classList.add('disabled');
            if (minBrightnessSlider) minBrightnessSlider.disabled = true;
        } else {
            // Enable randomness when twinkle is on
            if (randomnessGroup) randomnessGroup.classList.remove('disabled');
            if (randomnessSlider) randomnessSlider.disabled = false;
            // Enable min brightness
            if (minBrightnessGroup) minBrightnessGroup.classList.remove('disabled');
            if (minBrightnessSlider) minBrightnessSlider.disabled = false;
        }
    }

    // Make function globally accessible
    window.updateTwinkleMode = updateTwinkleMode;

    // Initial mode check
    setTimeout(updateTwinkleMode, 100);

    // Listen to twinkle speed slider to toggle twinkle mode
    const twinkleSpeedSlider = document.getElementById('twinkle-speed-slider');
    if (twinkleSpeedSlider) {
        twinkleSpeedSlider.addEventListener('input', () => {
            CONFIG.TWINKLE_SPEED = parseFloat(twinkleSpeedSlider.value);
            updateTwinkleMode();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DYNAMIC MAX LIGHTS CALCULATION
    // ─────────────────────────────────────────────────────────────────────────

    // Calculate dynamic max lights based on bulb size and pin count
    // Uses bilinear interpolation between four corner values:
    //   max bulb + max pins = 1, max bulb + min pins = 36
    //   min bulb + max pins = 24, min bulb + min pins = 100
    function calculateDynamicLightsMax(bulbSize, numPins) {
        const BULB_MIN = 0.05, BULB_MAX = 0.75;
        const PINS_MIN = 2, PINS_MAX = 12;

        // Corner values [bulb][pins]: [max][max]=1, [max][min]=36, [min][max]=24, [min][min]=100
        const MAX_BULB_MAX_PINS = 1;
        const MAX_BULB_MIN_PINS = 36;
        const MIN_BULB_MAX_PINS = 24;
        const MIN_BULB_MIN_PINS = 100;

        // Normalize inputs to 0-1 range
        const bulbT = Math.max(0, Math.min(1, (bulbSize - BULB_MIN) / (BULB_MAX - BULB_MIN)));
        const pinsT = Math.max(0, Math.min(1, (numPins - PINS_MIN) / (PINS_MAX - PINS_MIN)));

        // Bilinear interpolation
        const minPinsVal = MIN_BULB_MIN_PINS + bulbT * (MAX_BULB_MIN_PINS - MIN_BULB_MIN_PINS);
        const maxPinsVal = MIN_BULB_MAX_PINS + bulbT * (MAX_BULB_MAX_PINS - MIN_BULB_MAX_PINS);
        const result = minPinsVal + pinsT * (maxPinsVal - minPinsVal);

        return Math.max(1, Math.round(result));
    }

    // Update lights slider max based on bulb size and pins (clamp lights DOWN if exceeds)
    function updateLightsSliderMax() {
        const lightsSlider = document.getElementById('lights-slider');
        const bulbSlider = document.getElementById('bulb-size-slider');
        const pinsSlider = document.getElementById('pins-slider');
        if (!lightsSlider || !bulbSlider || !pinsSlider) return;

        // Read current values from DOM
        const currentBulbSize = parseFloat(bulbSlider.value);
        const currentNumPins = parseInt(pinsSlider.value, 10);
        const currentLights = parseInt(lightsSlider.value, 10);

        // Calculate dynamic max based on bulb size and pins
        const newMax = calculateDynamicLightsMax(currentBulbSize, currentNumPins);

        // Set slider max
        lightsSlider.max = newMax;

        // CLAMP lights DOWN if exceeds new max (do NOT adjust bulb size)
        if (currentLights > newMax) {
            lightsSlider.value = newMax;
            CONFIG.LIGHTS_PER_SEGMENT = newMax;
        }

        // Update the slider fill visual
        updateSliderFill(lightsSlider);

        // Update inline value display
        const inlineValue = lightsSlider.closest('.setting-group')?.querySelector('.slider-value');
        if (inlineValue) {
            inlineValue.textContent = lightsSlider.value;
        }
    }

    // Expose for use in slider handlers
    window.updateLightsSliderMax = updateLightsSliderMax;

    // ─────────────────────────────────────────────────────────────────────────
    //  SECTION 3.2: SLIDER MAPPINGS & CONFIG SYNC
    // ─────────────────────────────────────────────────────────────────────────

    // All UI mappings
    const mappings = [
        { id: 'theme-select', key: 'ACTIVE_THEME' },
        { id: 'wire-select', key: 'WIRE_THEME' },
        { id: 'socket-select', key: 'SOCKET_THEME' },
        { id: 'animation-style-select', key: 'ANIMATION_STYLE' },
        { id: 'stars-check', key: 'STARS_ENABLED', type: 'check' },
        { id: 'snow-check', key: 'SNOW_ENABLED', type: 'check' },
        { id: 'background-check', key: 'BACKGROUND_ENABLED', type: 'check' },
        { id: 'point-lights-check', key: 'POINT_LIGHTS_ENABLED', type: 'check' },
        { id: 'antialias-check', key: 'ANTIALIAS_ENABLED', type: 'check' },
        { id: 'pins-slider', key: 'NUM_PINS', type: 'int' },
        { id: 'sag-slider', key: 'SAG_AMPLITUDE' },
        { id: 'bulb-size-slider', key: 'BULB_SCALE' },
        { id: 'lights-slider', key: 'LIGHTS_PER_SEGMENT', type: 'int' },
        { id: 'twists-slider', key: 'WIRE_TWISTS', type: 'int' },
        { id: 'thickness-slider', key: 'WIRE_THICKNESS' },
        { id: 'twinkle-speed-slider', key: 'TWINKLE_SPEED' },
        { id: 'min-brightness-slider', key: 'TWINKLE_MIN_INTENSITY' },
        { id: 'max-brightness-slider', key: 'TWINKLE_MAX_INTENSITY' },

        { id: 'glass-opacity-slider', key: 'GLASS_OPACITY' },
        { id: 'glass-roughness-slider', key: 'GLASS_ROUGHNESS' },
        { id: 'emissive-slider', key: 'EMISSIVE_INTENSITY' },
        { id: 'speed-slider', key: 'ANIMATION_SPEED' },
        { id: 'sway-x-slider', key: 'SWAY_X' },
        { id: 'sway-z-slider', key: 'SWAY_Z' },
        { id: 'zoom-slider', key: 'CAMERA_DISTANCE' },
        { id: 'height-slider', key: 'CAMERA_HEIGHT' },
        { id: 'tension-slider', key: 'TENSION' },
        { id: 'wire-separation-slider', key: 'WIRE_SEPARATION' },
        { id: 'ambient-slider', key: 'AMBIENT_INTENSITY' },
        { id: 'bloom-strength-slider', key: 'BLOOM_STRENGTH' },
        { id: 'bloom-radius-slider', key: 'BLOOM_RADIUS' },
        { id: 'bloom-threshold-slider', key: 'BLOOM_THRESHOLD' },
        { id: 'bloom-intensity-slider', key: 'BLOOM_INTENSITY' },
        { id: 'snow-count-slider', key: 'SNOW_COUNT', type: 'int' },
        { id: 'snow-speed-slider', key: 'SNOW_SPEED' },
        { id: 'snow-size-slider', key: 'SNOW_SIZE' },
        { id: 'drift-slider', key: 'SNOW_DRIFT' },
        { id: 'stars-count-slider', key: 'STARS_COUNT', type: 'int' },
        { id: 'stars-size-slider', key: 'STARS_SIZE' },
        { id: 'stars-opacity-slider', key: 'STARS_OPACITY' },
        { id: 'stars-twinkle-slider', key: 'STARS_TWINKLE_SPEED' },
        { id: 'camera-x-slider', key: 'CAMERA_X' },
        { id: 'stats-check', key: 'STATS_ENABLED', type: 'check' }
    ];

    // Set initial values
    mappings.forEach(m => {
        const el = document.getElementById(m.id);
        if (!el) return;

        if (m.type === 'check') {
            el.checked = CONFIG[m.key];
        } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY' || m.key === 'ANIMATION_STYLE') {
            el.value = CONFIG[m.key];
        } else {
            el.value = CONFIG[m.key];
        }

        if (el.type === 'range') {
            const inlineValue = el.parentElement.querySelector('.inline-value');
            if (inlineValue) {
                inlineValue.textContent = el.value;
            }
        }
    });

    // Auto-update toggle with confirmation dialog when disabling
    const autoUpdateCheck = document.getElementById('auto-update-check');
    if (autoUpdateCheck) {
        // Set initial state from localStorage
        autoUpdateCheck.checked = isAutoUpdateEnabled();

        autoUpdateCheck.addEventListener('change', async (e) => {
            if (!e.target.checked) {
                // User is trying to DISABLE - show confirmation
                const confirmed = await customConfirm(
                    'Disable Auto-Updates?',
                    'If you disable auto-updates, you will need to manually clear your browser cache to receive new features and updates.\n\nAre you sure you want to disable?'
                );

                if (confirmed) {
                    setAutoUpdateEnabled(false);
                } else {
                    // User cancelled - revert toggle
                    e.target.checked = true;
                }
            } else {
                // User is enabling - no confirmation needed
                setAutoUpdateEnabled(true);
            }
        });
    }

    // Dynamic separation max based on thickness
    // thickness 0.05 → separation max 0.1, thickness 0.005 → separation max 0.02
    const thicknessSlider = document.getElementById('thickness-slider');
    const separationSlider = document.getElementById('wire-separation-slider');

    function updateSeparationMax() {
        if (!thicknessSlider || !separationSlider) return;
        const thickness = parseFloat(thicknessSlider.value);
        // Linear interpolation for separation limits based on thickness
        const minThickness = 0.005, maxThickness = 0.05;
        const t = Math.max(0, Math.min(1, (thickness - minThickness) / (maxThickness - minThickness)));

        // Min separation: at 0.005 thickness → 0.005 min, at 0.05 thickness → 0.02 min
        const minSepMin = 0.005, maxSepMin = 0.02;
        const newMin = minSepMin + t * (maxSepMin - minSepMin);

        // Max separation: at 0.005 thickness → 0.02 max, at 0.05 thickness → 0.1 max  
        const minSepMax = 0.02, maxSepMax = 0.1;
        const newMax = minSepMax + t * (maxSepMax - minSepMax);

        separationSlider.min = newMin.toFixed(4);
        separationSlider.max = newMax.toFixed(3);

        // Clamp current value if it exceeds new max
        let needsUpdate = false;
        let newValue = parseFloat(separationSlider.value);
        if (newValue > newMax) {
            newValue = newMax;
            needsUpdate = true;
        }
        if (newValue < newMin) {
            newValue = newMin;
            needsUpdate = true;
        }
        if (needsUpdate) {
            separationSlider.value = newValue;
            CONFIG.WIRE_SEPARATION = newValue;
            const label = separationSlider.parentElement.querySelector('.inline-value');
            if (label) label.textContent = newValue.toFixed(3);
        }

        // Update slider fill visual to match new range
        updateSliderFill(separationSlider);
    }

    if (thicknessSlider) {
        thicknessSlider.addEventListener('input', updateSeparationMax);
        updateSeparationMax(); // Initial call
    }

    // Dynamic height (Y) range based on zoom (camera distance)
    // At zoom 50: Y range -15 to +22
    // At zoom 1: Y range +2 to +5
    const zoomSlider = document.getElementById('zoom-slider');
    const heightSlider = document.getElementById('height-slider');
    let heightSliderInitialized = false;

    function updateHeightSliderRange() {
        if (!zoomSlider || !heightSlider) return;
        const zoom = parseFloat(zoomSlider.value);

        // Linear interpolation from zoom 1 → 50
        const minZoom = 1, maxZoom = 50;
        const t = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));

        // At zoom 1: min=+2, max=+5  |  At zoom 50: min=-15, max=+22
        const newMin = 2 + t * (-15 - 2);  // 2 → -15
        const newMax = 5 + t * (22 - 5);   // 5 → 22

        heightSlider.min = newMin.toFixed(1);
        heightSlider.max = newMax.toFixed(1);

        // Only clamp/center when user actively changes zoom, not on initial load
        if (heightSliderInitialized) {
            const currentVal = parseFloat(heightSlider.value);
            if (currentVal < newMin || currentVal > newMax) {
                const centerVal = (newMin + newMax) / 2;
                heightSlider.value = centerVal;
                CONFIG.CAMERA_HEIGHT = centerVal;
            }
        }
        heightSliderInitialized = true;

        // Update visual fill
        updateSliderFill(heightSlider);

        // Update label
        const label = heightSlider.parentElement?.querySelector('.inline-value');
        if (label) label.textContent = parseFloat(heightSlider.value).toFixed(1);
    }

    if (zoomSlider) {
        zoomSlider.addEventListener('input', updateHeightSliderRange);
        updateHeightSliderRange(); // Initial call
    }

    // Flag to prevent cascading rebuilds
    let isUpdatingFromConfig = false;

    // Update UI from CONFIG
    function updateUIFromConfig() {
        isUpdatingFromConfig = true;

        mappings.forEach(m => {
            const el = document.getElementById(m.id);
            if (!el) return;

            if (m.type === 'check') {
                el.checked = CONFIG[m.key];
            } else {
                el.value = CONFIG[m.key];
            }

            if (el.type === 'range') {
                const inlineValue = el.parentElement.querySelector('.inline-value');
                if (inlineValue) {
                    inlineValue.textContent = el.value;
                }
                updateSliderFill(el);
            }
        });

        if (themeDropdown) themeDropdown.setValue(CONFIG.ACTIVE_THEME);
        if (wireDropdown) wireDropdown.setValue(CONFIG.WIRE_THEME);
        if (socketDropdown) socketDropdown.setValue(CONFIG.SOCKET_THEME);
        if (animationStyleDropdown) animationStyleDropdown.setValue(CONFIG.ANIMATION_STYLE);

        const snowCheck = document.getElementById('snow-check');
        const starsCheck = document.getElementById('stars-check');
        if (snowCheck) {
            snowCheck.checked = CONFIG.SNOW_ENABLED || false;
            snowCheck.dispatchEvent(new Event('change', { bubbles: false }));
        }
        if (starsCheck) {
            starsCheck.checked = CONFIG.STARS_ENABLED || false;
            starsCheck.dispatchEvent(new Event('change', { bubbles: false }));
        }

        isUpdatingFromConfig = false;
    }

    // Apply changes function with debounce to prevent cascade
    let applyDebounceTimer = null;

    // Settings that require full scene rebuild (affect geometry or lighting setup)
    // NOTE: SAG_AMPLITUDE, TENSION, SWAY_X, SWAY_Z removed - they affect animation only, not geometry
    const REBUILD_REQUIRED_KEYS = new Set([
        'QUALITY', 'NUM_PINS', 'LIGHTS_PER_SEGMENT', 'WIRE_TWISTS', 'WIRE_THICKNESS',
        'WIRE_SEPARATION', 'POINT_LIGHTS_ENABLED', 'AVOID_ADJACENT_COLORS', 'BULB_SCALE',
        'ACTIVE_THEME', 'WIRE_THEME', 'SOCKET_THEME'
    ]);

    function applyChanges() {
        // Debounce: cancel pending call, schedule new one
        if (applyDebounceTimer) {
            clearTimeout(applyDebounceTimer);
        }

        applyDebounceTimer = setTimeout(() => {
            logUser('applyChanges() debounce fired');
            startTimer('applyChanges');

            // Track what changed
            let needsRebuild = false;
            const changedKeys = [];

            mappings.forEach(m => {
                const el = document.getElementById(m.id);
                if (!el) return;

                let newValue;
                if (m.type === 'check') {
                    newValue = el.checked;
                } else if (m.type === 'int') {
                    newValue = parseInt(el.value, 10);
                } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY' || m.key === 'ANIMATION_STYLE') {
                    newValue = el.value;
                } else {
                    newValue = parseFloat(el.value);
                }

                // Check if this setting changed and requires rebuild
                if (CONFIG[m.key] !== newValue) {
                    changedKeys.push({ key: m.key, old: CONFIG[m.key], new: newValue });
                    if (REBUILD_REQUIRED_KEYS.has(m.key)) {
                        needsRebuild = true;
                    }
                }

                CONFIG[m.key] = newValue;
            });

            if (changedKeys.length > 0) {
                logUser('Config changed', { keys: changedKeys, needsRebuild });
            }

            saveConfig();

            if (needsRebuild) {
                logUser('Triggering scene rebuild (geometry changed)');
                initScene(true); // Force new bake cycle since geometry changed
            } else {
                logUser('No rebuild needed - live update only');
                // Post-FX updates are automatic since they read from CONFIG each frame
            }

            endTimer('applyChanges');
            applyDebounceTimer = null;
        }, 200); // 200ms debounce
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SECTION 3.3: TAB SWITCHING & FEATURE TOGGLES
    // ─────────────────────────────────────────────────────────────────────────

    // TAB SWITCHING
    const tabBtns = document.querySelectorAll('.card-tab-btn');
    const tabContents = document.querySelectorAll('.card-tab-content');

    tabBtns.forEach(btn => {
        if (btn.dataset.listenerAdded === 'true') {
            logWarn('UI', 'Tab button already has listener, skipping');
            return;
        }
        btn.dataset.listenerAdded = 'true';

        btn.addEventListener('click', () => {
            const targetId = btn.dataset.cardTab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            } else {
                logError('UI', `Tab content not found for ID: ${targetId}`);
            }
        });
    });

    // SNOW/STAR TOGGLE HANDLERS
    const snowCheck = document.getElementById('snow-check');
    const snowSettings = document.getElementById('snow-settings');
    if (snowCheck && snowSettings) {
        snowCheck.addEventListener('change', (e) => {
            CONFIG.SNOW_ENABLED = e.target.checked;

            if (e.target.checked) {
                if (window.stagedSnowValues) {
                    CONFIG.SNOW_COUNT = window.stagedSnowValues.count;
                    CONFIG.SNOW_SPEED = window.stagedSnowValues.speed;
                    CONFIG.SNOW_SIZE = window.stagedSnowValues.size;
                    CONFIG.SNOW_DRIFT = window.stagedSnowValues.drift;
                }
                snowSettings.classList.remove('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].snowEnabled = true;
                    savePresetPreferences();
                    showToast(`Snow will now be enabled when you load the "${currentPreset}" preset.`, 'success', 4000);
                }
            } else {
                // Stage current values BEFORE disabling (so they can be restored)
                window.stagedSnowValues = {
                    count: CONFIG.SNOW_COUNT,
                    speed: CONFIG.SNOW_SPEED,
                    size: CONFIG.SNOW_SIZE,
                    drift: CONFIG.SNOW_DRIFT
                };
                snowSettings.classList.add('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].snowEnabled = false;
                    savePresetPreferences();
                }
            }

            const snowCountSlider = document.getElementById('snow-count-slider');
            const snowSizeSlider = document.getElementById('snow-size-slider');
            const snowSpeedSlider = document.getElementById('snow-speed-slider');
            const driftSlider = document.getElementById('drift-slider');

            if (snowCountSlider) {
                snowCountSlider.value = CONFIG.SNOW_COUNT;
                const label = snowCountSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_COUNT;
            }
            if (snowSizeSlider) {
                snowSizeSlider.value = CONFIG.SNOW_SIZE;
                const label = snowSizeSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_SIZE.toFixed(2);
            }
            if (snowSpeedSlider) {
                snowSpeedSlider.value = CONFIG.SNOW_SPEED;
                const label = snowSpeedSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_SPEED.toFixed(3);
            }
            if (driftSlider) {
                driftSlider.value = CONFIG.SNOW_DRIFT;
                const label = driftSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.SNOW_DRIFT.toFixed(2);
            }

            document.querySelectorAll('#snow-settings input[type="range"]').forEach(s => {
                s.dispatchEvent(new Event('input', { bubbles: true }));
            });

            // Only apply if this was a user action (not triggered by updateUIFromConfig)
            // Note: applyChanges() already calls saveConfig(), so no need to call it here
            if (!isUpdatingFromConfig) {
                applyChanges();
            }
        });

        if (!CONFIG.SNOW_ENABLED) {
            snowSettings.classList.add('disabled');
        }
    }

    // Star toggle handler
    const starsCheck = document.getElementById('stars-check');
    const starSettings = document.getElementById('star-settings');
    if (starsCheck && starSettings) {
        starsCheck.addEventListener('change', (e) => {
            CONFIG.STARS_ENABLED = e.target.checked;

            if (e.target.checked) {
                if (window.stagedStarValues) {
                    CONFIG.STARS_COUNT = window.stagedStarValues.count;
                    CONFIG.STARS_SIZE = window.stagedStarValues.size;
                    CONFIG.STARS_OPACITY = window.stagedStarValues.opacity;
                    CONFIG.STARS_TWINKLE_SPEED = window.stagedStarValues.twinkle;
                }
                starSettings.classList.remove('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].starsEnabled = true;
                    savePresetPreferences();
                    showToast(`Stars will now be enabled when you load the "${currentPreset}" preset.`, 'success', 4000);
                }
            } else {
                // Stage current values BEFORE disabling (so they can be restored)
                window.stagedStarValues = {
                    count: CONFIG.STARS_COUNT,
                    size: CONFIG.STARS_SIZE,
                    opacity: CONFIG.STARS_OPACITY,
                    twinkle: CONFIG.STARS_TWINKLE_SPEED
                };
                starSettings.classList.add('disabled');

                const currentPreset = getCurrentPresetName();
                if (currentPreset && presetPreferences[currentPreset] !== undefined) {
                    presetPreferences[currentPreset].starsEnabled = false;
                    savePresetPreferences();
                }
            }

            const starsCountSlider = document.getElementById('stars-count-slider');
            const starsSizeSlider = document.getElementById('stars-size-slider');
            const starsOpacitySlider = document.getElementById('stars-opacity-slider');
            const starsTwinkleSlider = document.getElementById('stars-twinkle-slider');

            if (starsCountSlider) {
                starsCountSlider.value = CONFIG.STARS_COUNT;
                const label = starsCountSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_COUNT;
            }
            if (starsSizeSlider) {
                starsSizeSlider.value = CONFIG.STARS_SIZE;
                const label = starsSizeSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_SIZE.toFixed(1);
            }
            if (starsOpacitySlider) {
                starsOpacitySlider.value = CONFIG.STARS_OPACITY;
                const label = starsOpacitySlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_OPACITY.toFixed(1);
            }
            if (starsTwinkleSlider) {
                starsTwinkleSlider.value = CONFIG.STARS_TWINKLE_SPEED;
                const label = starsTwinkleSlider.parentElement.querySelector('.inline-value');
                if (label) label.textContent = CONFIG.STARS_TWINKLE_SPEED.toFixed(1);
            }

            document.querySelectorAll('#star-settings input[type="range"]').forEach(s => {
                s.dispatchEvent(new Event('input', { bubbles: true }));
            });

            // Only apply if this was a user action (not triggered by updateUIFromConfig)
            // Note: applyChanges() already calls saveConfig(), so no need to call it here
            if (!isUpdatingFromConfig) {
                applyChanges();
            }
        });

        if (!CONFIG.STARS_ENABLED) {
            starSettings.classList.add('disabled');
        }
    }

    // ANTIALIAS TOGGLE - special handler that requires page reload
    const antialiasCheck = document.getElementById('antialias-check');
    if (antialiasCheck) {
        antialiasCheck.addEventListener('change', () => {
            CONFIG.ANTIALIAS_ENABLED = antialiasCheck.checked;
            saveConfig();
            // Show toast and reload page after short delay
            showToast('Applying antialiasing change...', 'progress', 1500);
            setTimeout(() => {
                location.reload();
            }, 500);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  SECTION 3.4: UI VISIBILITY & KEYBOARD SHORTCUTS
    // ─────────────────────────────────────────────────────────────────────────

    // HEADER BUTTONS
    const toggleUIBtn = document.getElementById('toggle-ui-btn');
    const floatingUIBtn = document.getElementById('show-ui-btn');
    const saveBtn = document.getElementById('save-preset-btn');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');

    // Toggle UI visibility (with debounce to prevent double-toggle from touch+click)
    let isTogglingUI = false;
    function toggleUI() {
        if (isTogglingUI) return; // Prevent racing calls
        isTogglingUI = true;
        setTimeout(() => { isTogglingUI = false; }, 300); // Reset after 300ms

        // Remove the early-load hide style if it exists (fixes refresh-while-hidden bug)
        const hideStyle = document.getElementById('panel-hide-style');
        if (hideStyle) {
            hideStyle.remove();
        }

        const panel = document.getElementById('settings-panel');
        const isHidden = panel.classList.toggle('hidden');

        if (isHidden) {
            if (floatingUIBtn) floatingUIBtn.classList.remove('hidden');
        } else {
            if (floatingUIBtn) floatingUIBtn.classList.add('hidden');
        }

        safeSetItem('christmas_lights_ui_visible', isHidden ? 'false' : 'true');
    }

    // Restore UI State on Init
    const savedUiState = localStorage.getItem('christmas_lights_ui_visible');
    if (savedUiState === 'false') {
        const panel = document.getElementById('settings-panel');
        if (panel) panel.classList.add('hidden');
        if (floatingUIBtn) floatingUIBtn.classList.remove('hidden');
    }

    if (toggleUIBtn) {
        toggleUIBtn.addEventListener('click', toggleUI);
    }

    if (floatingUIBtn) {
        floatingUIBtn.addEventListener('click', toggleUI);
    }

    // Keyboard shortcut: H key to toggle UI
    document.addEventListener('keydown', (e) => {
        if (e.key === 'h' || e.key === 'H') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            toggleUI();
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    //  SECTION 3.5: PRESET MANAGEMENT (Save/Export/Import)
    // ─────────────────────────────────────────────────────────────────────────

    // Save preset
    if (saveBtn) {
        const handleSave = async () => {

            saveBtn.style.opacity = '0.7';

            mappings.forEach(m => {
                const el = document.getElementById(m.id);
                if (!el) return;

                if (m.type === 'check') {
                    CONFIG[m.key] = el.checked;
                } else if (m.type === 'int') {
                    CONFIG[m.key] = parseInt(el.value, 10);
                } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY' || m.key === 'ANIMATION_STYLE') {
                    CONFIG[m.key] = el.value;
                } else {
                    CONFIG[m.key] = parseFloat(el.value);
                }
            });

            const presetName = await customPrompt('Name your custom preset:', 'My Custom Preset');

            if (presetName && presetName.trim()) {
                let customPresets = {};
                try {
                    customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
                } catch (e) {
                    logError('Presets', 'Failed to parse custom_presets', e);
                    customPresets = {};
                }
                customPresets[presetName.trim()] = { ...CONFIG };
                safeSetItem('custom_presets', JSON.stringify(customPresets));

                showToast(`Preset "${presetName}" saved!`, 'success');

                loadCustomPresets();
            }

            saveBtn.style.opacity = '1';
        };

        saveBtn.addEventListener('click', handleSave);
    }

    // Export preset
    if (exportBtn) {
        const handleExport = async () => {

            exportBtn.style.opacity = '0.7';

            mappings.forEach(m => {
                const el = document.getElementById(m.id);
                if (!el) return;

                if (m.type === 'check') {
                    CONFIG[m.key] = el.checked;
                } else if (m.type === 'int') {
                    CONFIG[m.key] = parseInt(el.value, 10);
                } else if (m.key === 'ACTIVE_THEME' || m.key === 'WIRE_THEME' || m.key === 'QUALITY' || m.key === 'ANIMATION_STYLE') {
                    CONFIG[m.key] = el.value;
                } else {
                    CONFIG[m.key] = parseFloat(el.value);
                }
            });

            // Build compact export object using short keys
            const compactConfig = {};
            for (const [longKey, shortKey] of Object.entries(KEY_MAP)) {
                if (CONFIG[longKey] !== undefined) {
                    compactConfig[shortKey] = CONFIG[longKey];
                }
            }

            const exportString = `XMAS:${btoa(JSON.stringify(compactConfig))}`;

            let clipboardSuccess = false;
            try {
                await navigator.clipboard.writeText(exportString);
                clipboardSuccess = true;
            } catch (e) {
                // Clipboard API failed, fallback to textarea
            }

            if (clipboardSuccess) {
                await customAlert('Exported!', 'Preset code copied to clipboard!\n\nShare this code with others or save it for later.');
            } else {
                await customTextarea(
                    'Export Preset',
                    'Copy this code (Ctrl+A, Ctrl+C):',
                    '',
                    exportString
                );
            }

            exportBtn.style.opacity = '1';
        };

        exportBtn.addEventListener('click', handleExport);
    }

    // Import preset
    if (importBtn) {
        const handleImport = async () => {

            importBtn.style.opacity = '0.7';

            const importString = await customTextarea(
                'Import Preset',
                'Paste your preset code below (Ctrl+V):',
                'XMAS:...'
            );

            if (!importString || !importString.trim()) {
                importBtn.style.opacity = '1';
                return;
            }

            try {
                if (!importString.startsWith('XMAS:')) {
                    throw new Error('Invalid preset code format');
                }

                const encodedData = importString.substring(5);
                const decodedConfig = JSON.parse(atob(encodedData));

                // Convert short keys to long keys if needed
                const importedConfig = {};
                for (const [key, value] of Object.entries(decodedConfig)) {
                    // Check if it's a short key
                    const longKey = REVERSE_KEY_MAP[key];
                    if (longKey) {
                        importedConfig[longKey] = value;
                    } else {
                        // Already a long key (backwards compatible with old format)
                        importedConfig[key] = value;
                    }
                }

                const presetName = await customPrompt(
                    'Name this imported preset (leave blank to apply without saving):',
                    'Imported Preset'
                );

                if (!presetName || !presetName.trim()) {
                    // Validate: only copy keys that exist in CONFIG
                    for (const key of Object.keys(importedConfig)) {
                        if (key in CONFIG) {
                            CONFIG[key] = importedConfig[key];
                        }
                    }
                    updateUIFromConfig();
                    applyChanges();
                    await customAlert('Applied!', 'Preset applied (not saved)');
                    importBtn.style.opacity = '1';
                    return;
                }

                const customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
                customPresets[presetName.trim()] = importedConfig;
                safeSetItem('custom_presets', JSON.stringify(customPresets));

                Object.assign(CONFIG, importedConfig);
                updateUIFromConfig();
                applyChanges();

                loadCustomPresets();

                showToast(`Preset "${presetName}" imported!`, 'success');
                importBtn.style.opacity = '1';

            } catch (e) {
                logError('Presets', 'Import failed', e);
                await customAlert('Error', 'Invalid preset code!\n\nPlease check the code and try again.');
                importBtn.style.opacity = '1';
            }
        };

        importBtn.addEventListener('click', handleImport);
    }

    // Load custom presets
    function loadCustomPresets() {
        let customPresets = {};
        try {
            customPresets = JSON.parse(localStorage.getItem('custom_presets') || '{}');
        } catch (e) {
            logError('Presets', 'Failed to parse custom_presets', e);
            customPresets = {};
        }
        const presetBar = document.querySelector('.preset-bar');
        const divider = document.querySelector('.custom-divider');

        presetBar.querySelectorAll('.custom-preset-btn').forEach(btn => btn.remove());

        const presetNames = Object.keys(customPresets);

        if (divider) {
            if (presetNames.length > 0) {
                divider.classList.remove('hidden');
            } else {
                divider.classList.add('hidden');
            }
        }

        presetNames.forEach(presetName => {
            const btn = document.createElement('button');
            btn.className = 'preset-btn custom-preset-btn';
            btn.textContent = presetName;
            btn.dataset.preset = presetName;

            btn.addEventListener('click', () => {
                Object.assign(CONFIG, customPresets[presetName]);
                updateUIFromConfig();
                applyChanges();
            });

            btn.addEventListener('contextmenu', async (e) => {
                e.preventDefault();

                const confirmed = await customConfirm(
                    'Delete Preset',
                    `Delete preset "${presetName}"?\n\nThis cannot be undone.`
                );

                if (confirmed) {
                    delete customPresets[presetName];
                    safeSetItem('custom_presets', JSON.stringify(customPresets));
                    loadCustomPresets();
                    showToast('Preset deleted', 'error');
                }
            });

            presetBar.appendChild(btn);
        });
    }

    loadCustomPresets();

    // Expose for tutorial to use
    window.loadCustomPresets = loadCustomPresets;

    // ─────────────────────────────────────────────────────────────────────────
    //  SECTION 3.6: BUILT-IN PRESET DEFINITIONS
    // ─────────────────────────────────────────────────────────────────────────

    // PRESET SYSTEM - uses imported PRESETS from presets.js
    const presets = PRESETS;

    // Built-in preset buttons
    document.querySelectorAll('.preset-btn:not(.custom-preset-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetName = btn.dataset.preset;

            if (presetName === 'random') {
                const themeKeys = Object.keys(THEMES);
                const wireKeys = Object.keys(WIRE_THEMES);

                CONFIG.ACTIVE_THEME = themeKeys[Math.floor(Math.random() * themeKeys.length)];
                CONFIG.WIRE_THEME = wireKeys[Math.floor(Math.random() * wireKeys.length)];

                CONFIG.COLOR_CYCLING_ENABLED = Math.random() > 0.5;
                CONFIG.AVOID_ADJACENT_COLORS = Math.random() > 0.5;
                CONFIG.SNOW_ENABLED = Math.random() > 0.6;
                CONFIG.BACKGROUND_ENABLED = Math.random() > 0.5;
                CONFIG.STARS_ENABLED = Math.random() > 0.5;

                // First quarter of ranges for more reasonable random values
                CONFIG.NUM_PINS = Math.floor(Math.random() * 4) + 3;  // 3-6 (was 3-17)
                CONFIG.SAG_AMPLITUDE = Math.random() * 2;  // 0-2 (was 0-8)
                CONFIG.TENSION = Math.random() * 0.375;  // 0-0.375 (was 0-1.5)
                CONFIG.LIGHTS_PER_SEGMENT = Math.floor(Math.random() * 6) + 1;  // 1-6 (was 1-25)

                CONFIG.BULB_SCALE = 0.05 + Math.random() * 0.075;  // 0.05-0.125 (was 0.05-0.35)
                CONFIG.BLOOM_STRENGTH = 0.5 + Math.random() * 0.5;  // 0.5-1.0 (was 0.5-2.5)
                CONFIG.BLOOM_RADIUS = 0.2 + Math.random() * 0.25;  // 0.2-0.45 (was 0.2-1.2)
                CONFIG.BLOOM_THRESHOLD = Math.random() * 0.2;  // 0-0.2 (was 0-0.8)
                CONFIG.BLOOM_INTENSITY = 0.5 + Math.random() * 0.375;  // 0.5-0.875 (was 0.5-2.0)
                CONFIG.EMISSIVE_INTENSITY = Math.random() * 0.625;  // 0-0.625 (was 0-2.5)

                CONFIG.GLASS_OPACITY = 0.1 + Math.random() * 0.175;  // 0.1-0.275 (was 0.1-0.8)
                CONFIG.GLASS_ROUGHNESS = Math.random() * 0.25;  // 0-0.25 (was 0-1.0)
                CONFIG.GLASS_IOR = 1.0 + Math.random() * 0.325;  // 1.0-1.325 (was 1.0-2.3)

                CONFIG.WIRE_TWISTS = Math.floor(Math.random() * 50);  // 0-50 (was 0-200)
                CONFIG.WIRE_THICKNESS = 0.005 + Math.random() * 0.0125;  // 0.005-0.0175 (was 0.005-0.055)
                CONFIG.WIRE_SEPARATION = 0.005 + Math.random() * 0.02;  // 0.005-0.025 (was 0.005-0.085)

                CONFIG.ANIMATION_SPEED = Math.random() * 0.375;  // 0-0.375 (was 0-1.5)
                CONFIG.SWAY_Z = Math.random() * 0.1;  // 0-0.1 (was 0-0.4)
                CONFIG.SWAY_X = CONFIG.SWAY_Z * 0.2;

                CONFIG.TWINKLE_SPEED = Math.random() * 0.03;  // 0-0.03 (was 0-0.12)
                CONFIG.TWINKLE_MIN_INTENSITY = Math.random() * 0.1;  // 0-0.1 (was 0-0.4)
                CONFIG.TWINKLE_RANDOMNESS = Math.random() * 0.45;  // 0-0.45 (was 0-1.8)

                if (CONFIG.SNOW_ENABLED) {
                    CONFIG.SNOW_COUNT = Math.floor(Math.random() * 625) + 500;  // 500-1125 (was 500-3000)
                    CONFIG.SNOW_SPEED = 0.005 + Math.random() * 0.0075;  // 0.005-0.0125 (was 0.005-0.035)
                    CONFIG.SNOW_SIZE = 0.01 + Math.random() * 0.0125;  // 0.01-0.0225 (was 0.01-0.06)
                    CONFIG.SNOW_DRIFT = Math.random() * 0.015;  // 0-0.015 (was 0-0.06)
                }

                CONFIG.AMBIENT_INTENSITY = 1.0 + Math.random() * 0.5;  // 1.0-1.5 (was 1.0-2.0)

                CONFIG.CAMERA_DISTANCE = 8 + Math.random() * 6.25;  // 8-14.25 (was 8-33)
                CONFIG.CAMERA_HEIGHT = -5 + Math.random() * 3.75;  // -5 to -1.25 (was -5 to 10)

            } else if (presets[presetName]) {
                setCurrentPresetName(presetName);

                const presetData = presets[presetName];

                const userPref = presetPreferences[presetName] || { snowEnabled: false, starsEnabled: false };

                window.stagedSnowValues = {
                    count: presetData.SNOW_COUNT || 100,
                    speed: presetData.SNOW_SPEED || 0.005,
                    size: presetData.SNOW_SIZE || 0.01,
                    drift: presetData.SNOW_DRIFT || 0.0
                };

                window.stagedStarValues = {
                    count: presetData.STARS_COUNT || 100,
                    size: presetData.STARS_SIZE || 0.1,
                    opacity: presetData.STARS_OPACITY || 0.1,
                    twinkle: presetData.STARS_TWINKLE_SPEED || 0.0
                };

                Object.assign(CONFIG, presetData);

                // Update camera system for new preset camera values
                if (window.lastLoadedCameraData) {
                    window.lastLoadedCameraData.distance = CONFIG.CAMERA_DISTANCE || 14;
                    window.lastLoadedCameraData.height = CONFIG.CAMERA_HEIGHT || 0;
                    window.lastLoadedCameraData.pan = CONFIG.CAMERA_X || 0;
                    // Recalculate visible dimensions for new distance
                    const tanFov = Math.tan((40 * Math.PI / 180) / 2);
                    window.lastLoadedCameraData.refVisibleHeight = 2 * tanFov * window.lastLoadedCameraData.distance;
                    window.lastLoadedCameraData.refVisibleWidth = window.lastLoadedCameraData.refVisibleHeight * REFERENCE_RESOLUTION.aspect;
                }
                // Reset camera offset (preset defines absolute position)
                window.cameraOffset = { distance: 0, height: 0, pan: 0 };
                updateCameraBase();

                CONFIG.SNOW_ENABLED = userPref.snowEnabled || false;
                CONFIG.STARS_ENABLED = userPref.starsEnabled || false;

                if (!CONFIG.SNOW_ENABLED) {
                    CONFIG.SNOW_COUNT = 100;
                    CONFIG.SNOW_SPEED = 0.005;
                    CONFIG.SNOW_SIZE = 0.01;
                    CONFIG.SNOW_DRIFT = 0.0;
                }

                if (!CONFIG.STARS_ENABLED) {
                    CONFIG.STARS_COUNT = 100;
                    CONFIG.STARS_SIZE = 0.1;
                    CONFIG.STARS_OPACITY = 0.1;
                    CONFIG.STARS_TWINKLE_SPEED = 0.0;
                }

                const hasSnow = window.stagedSnowValues.count > 100;
                const hasStars = window.stagedStarValues.count > 100;

                const needsSnowToast = hasSnow && !userPref.snowEnabled;
                const needsStarsToast = hasStars && !userPref.starsEnabled;

                if (needsSnowToast && needsStarsToast) {
                    showToast('This preset contains settings for snow and stars. Enable them in the Extras tab to see them.', 'info', 5000);
                } else if (needsSnowToast) {
                    showToast('This preset contains settings for snow. Enable it in the Extras tab to see it.', 'info', 5000);
                } else if (needsStarsToast) {
                    showToast('This preset contains settings for stars. Enable it in the Extras tab to see it.', 'info', 5000);
                }
            }

            updateUIFromConfig();
            applyChanges();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    //  SECTION 3.7: LIVE UPDATES & INPUT HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    // INLINE VALUE UPDATES & VISUAL FILL
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        updateSliderFill(slider);

        slider.addEventListener('input', () => {
            if (slider.id === 'quality-slider') return;

            const inlineValue = slider.parentElement.querySelector('.inline-value');
            if (inlineValue) {
                inlineValue.textContent = slider.value;
            }
            updateSliderFill(slider);
        });
    });

    // LIVE UPDATES
    let updateTimeout = null;

    function triggerLiveUpdate() {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }

        updateTimeout = setTimeout(() => {
            logUser('triggerLiveUpdate() → applyChanges()');
            applyChanges();
        }, 300);
    }

    document.querySelectorAll('input[type="range"]').forEach(slider => {
        // Input event: update display values only (during drag)
        slider.addEventListener('input', () => {
            logUser(`Slider input: ${slider.id}`, { value: slider.value });
            // Immediate visual-only updates for particle settings (no rebuild)
            if (slider.id === 'snow-speed-slider') {
                CONFIG.SNOW_SPEED = parseFloat(slider.value);
            } else if (slider.id === 'snow-size-slider') {
                CONFIG.SNOW_SIZE = parseFloat(slider.value);
            } else if (slider.id === 'drift-slider') {
                CONFIG.SNOW_DRIFT = parseFloat(slider.value);
            }
            // Note: no triggerLiveUpdate here - we wait for mouseup
        });
        // Change event: apply changes only on mouseup/release
        slider.addEventListener('change', () => {
            logUser(`Slider change (mouseup): ${slider.id}`, { value: slider.value });
            triggerLiveUpdate();
        });
    });

    // Dynamic lights per span max based on pin count AND bulb size
    // Uses bilinear interpolation (see calculateDynamicLightsMax above)
    const pinsSlider = document.getElementById('pins-slider');
    const bulbSizeSlider = document.getElementById('bulb-size-slider');
    const lightsSlider = document.getElementById('lights-slider');

    if (pinsSlider) {
        pinsSlider.addEventListener('input', updateLightsSliderMax);
    }
    if (bulbSizeSlider) {
        bulbSizeSlider.addEventListener('input', updateLightsSliderMax);
    }
    // Initialize on load
    setTimeout(updateLightsSliderMax, 100);

    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            applyChanges();
        });
    });

    document.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', () => {
            applyChanges();
        });
    });

    // Initialize proximity hover effect for title
    initProximityHover();

    const isEmbedMode = new URLSearchParams(window.location.search).get('embed') === '1';

    // The melty.lol embed needs the scene only, with no first-visit tour modal.
    if (!isEmbedMode) {
        initTutorial();
    }

}
