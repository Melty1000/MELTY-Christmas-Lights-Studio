// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                           SCENE & RENDERER                                ║
// ╠═══════════════════════════════════════════════════════════════════════════╣
// ║  SECTION 1: Scene Initialization (initScene) .............. Lines 29-376  ║
// ║  SECTION 2: Animation Loop (animate) ...................... Lines 381-576 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG, THEMES, WIRE_THEMES, SOCKET_THEMES } from './config.js';
import { updateCameraBase, applyFinalPosition } from './config.js';
import { getBulbPalette, showToast, dismissToast, updateToastProgress } from './utils.js';
import { Wire, createBulbInstance, createStars, updateStars, createSnowParticles, updateSnow, generateBasePoints, shouldRecreateSnow, shouldRecreateStars } from './geometry.js';
import { initPostFX, sceneBloom, createBloomClone, syncBloomTransforms, renderWithPostFX, resizePostFX, lastRenderInfo } from './postfx.js';
import { initSparkleSystem, updateSparkleSystem, disposeSparkleSystem } from './effects/sparkle.js';
import { debug, logInit, logPerf, logInfo, startTimer, endTimer, logGeom, logError } from './debug.js';

// Declare mutable globals locally (can't import them - imports are read-only)
let container, renderer, camera;
let animationFrameId = null;
let activeScene, activeLights, activeTwistedWire;
let activePoints = [];
let originalBasePoints = [];
let stars = null;
let snowParticles = null;
let ambientLight = null;
let pendingLoadingToast = null;  // Toast to dismiss after first frame

// Stats panel variables
let statsPanel = null;
let statsFrames = 0;
let statsLastTime = performance.now();
let statsFPS = 0;
let statsMS = 0;

// Create stats panel DOM element
function createStatsPanel() {
    if (statsPanel) return;
    statsPanel = document.createElement('div');
    statsPanel.id = 'stats-panel';
    statsPanel.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0,0,0,0.85);
        color: #0f0;
        font-family: monospace;
        font-size: 12px;
        padding: 8px 12px;
        border-radius: 4px;
        z-index: 10000;
        pointer-events: none;
        min-width: 120px;
        border: 1px solid #333;
    `;
    document.body.appendChild(statsPanel);
}

function removeStatsPanel() {
    if (statsPanel) {
        statsPanel.remove();
        statsPanel = null;
    }
}

function updateStatsPanel() {
    if (!statsPanel || !CONFIG.STATS_ENABLED) return;

    statsFrames++;
    const now = performance.now();
    const elapsed = now - statsLastTime;

    if (elapsed >= 250) { // Update 4 times per second
        statsFPS = Math.round((statsFrames * 1000) / elapsed);
        statsMS = (elapsed / statsFrames).toFixed(1);
        statsFrames = 0;
        statsLastTime = now;

        let html = `<div style="color:#0f0">FPS: ${statsFPS}</div>`;
        html += `<div style="color:#ff0">MS: ${statsMS}</div>`;

        // Memory (Chrome only - hidden on file:// where it doesn't update)
        if (performance.memory && window.location.protocol !== 'file:') {
            const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
            html += `<div style="color:#f0f">MEM: ${mb} MB</div>`;
        }

        // Draw calls from post-fx render info (captured after composer.render)
        html += `<div style="color:#0ff">Draws: ${lastRenderInfo.calls}</div>`;
        html += `<div style="color:#0ff">Tris: ${lastRenderInfo.triangles}</div>`;

        // Baking status
        if (activeTwistedWire && activeTwistedWire.isBaking) {
            html += `<div style="color:#f80">BAKING...</div>`;
        }

        statsPanel.innerHTML = html;
    }
}

export { createStatsPanel, removeStatsPanel, updateStatsPanel };

// Reusable Vector3 instances for animate loop (avoid per-frame GC)
const _tempUp = new THREE.Vector3(0, 1, 0);
const _tempRight = new THREE.Vector3();
const _tempDown = new THREE.Vector3();
const _tempUnitDown = new THREE.Vector3(0, -1, 0);

// Reusable Color instances for color cycling (avoid per-frame GC)
const _prevColor = new THREE.Color();
const _nextColor = new THREE.Color();
const _blendColor = new THREE.Color();

// Export these so other modules can access them
export { container, renderer, camera, animationFrameId, activeScene, activeLights, activeTwistedWire, activePoints, originalBasePoints, stars, snowParticles };

// ═══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: SCENE INITIALIZATION (initScene & _initSceneInternal)
// ═══════════════════════════════════════════════════════════════════════════════

export function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Resize post-fx render targets
        resizePostFX(window.innerWidth, window.innerHeight);
    }
}

let isInitializing = false;
let pendingInitTimeout = null;

export function initScene(forceNewBake = false) {
    logInit('initScene() called', { forceNewBake });
    startTimer('initScene-total');

    // Abort any in-progress geometry computation
    if (window._geometryAbortSignal) {
        logInit('Aborting in-progress geometry computation');
        window._geometryAbortSignal.cancelled = true;
    }

    // Cancel any pending initialization
    if (pendingInitTimeout) {
        logInit('Cancelling pending init timeout');
        clearTimeout(pendingInitTimeout);
        pendingInitTimeout = null;
    }

    // If already initializing, mark that we need to restart
    if (isInitializing) {
        logInit('Already initializing - queuing restart');
        window._needsReInit = forceNewBake;
        return;
    }
    isInitializing = true;

    // Cancel any running animation first
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);

    // Show loading toast FIRST (before heavy work)
    logInit('Showing loading toast');
    const loadingToastId = showToast('Initializing scene...', 'progress', 0, { persistent: true, progress: 0 });

    // Use setTimeout to let the toast render before heavy disposal/creation
    pendingInitTimeout = setTimeout(async () => {
        logInit('setTimeout callback fired - starting main init');
        pendingInitTimeout = null;

        // Dispose old scene (now runs AFTER toast paints)
        if (activeScene) {
            startTimer('dispose-old-scene');
            logInit('Disposing old scene...');
            activeScene.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    Array.isArray(child.material) ? child.material.forEach(m => m.dispose()) : child.material.dispose();
                }
            });
            endTimer('dispose-old-scene');
        }

        await _initSceneInternal(loadingToastId, forceNewBake);
    }, 50);
}

async function _initSceneInternal(loadingToastId, forceNewBake = false) {
    logInit('_initSceneInternal() started');
    startTimer('_initSceneInternal-total');
    // Antialiasing setting - takes effect on renderer creation (first load or refresh)
    const useAntialias = CONFIG.ANTIALIAS_ENABLED !== false;

    if (!container) {
        container = document.getElementById('canvas-container');
        camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(CONFIG.CAMERA_X ?? 0, CONFIG.CAMERA_HEIGHT ?? 0, CONFIG.CAMERA_DISTANCE ?? 14);
        renderer = new THREE.WebGLRenderer({ antialias: useAntialias, alpha: true, premultipliedAlpha: false });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.autoClear = true;
        renderer.info.autoReset = false; // Manual reset for accurate stats with EffectComposer

        // WebGL context lost/restored handlers
        renderer.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            logError('Renderer', 'WebGL context lost - rendering paused');
            showToast('Graphics context lost - please refresh if rendering stops', 'warning');
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }, false);

        renderer.domElement.addEventListener('webglcontextrestored', () => {
            showToast('Graphics restored', 'success');
            initScene(); // Reinitialize the scene
        }, false);

        // Define onWindowResize to use base+offset system
        if (typeof onWindowResize === 'undefined') {
            window.onWindowResize = function () {
                if (renderer && camera) {
                    renderer.setSize(window.innerWidth, window.innerHeight);
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();

                    // Update base+offset system
                    if (window.lastLoadedCameraData) {
                        updateCameraBase();
                        applyFinalPosition(camera, renderer, activeScene);
                    }

                    // Resize post-fx
                    resizePostFX(window.innerWidth, window.innerHeight);
                }
            };
        }

        if (!window.resizeListenerAdded) {
            window.addEventListener('resize', onWindowResize);
            window.resizeListenerAdded = true;
        }
    } else {
        // Use base+offset values instead of raw CONFIG
        camera.position.set(CONFIG.CAMERA_X ?? 0, CONFIG.CAMERA_HEIGHT ?? 0, CONFIG.CAMERA_DISTANCE ?? 14);
    }
    if (renderer.domElement.parentNode !== container) {
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
    }
    onWindowResize();

    // Reset point light counter for new scene
    window._pointLightCount = 0;

    activeScene = new THREE.Scene();

    // Sparkle system will be initialized after scene creation

    if (CONFIG.BACKGROUND_ENABLED) {
        activeScene.background = new THREE.Color(0x0a1a3a);
        renderer.setClearColor(0x0a1a3a, 1);
    } else {
        activeScene.background = null;
        renderer.setClearColor(0x000000, 0);
    }

    const wireColors = WIRE_THEMES[CONFIG.WIRE_THEME] || WIRE_THEMES['CHRISTMAS'];

    ambientLight = new THREE.AmbientLight(0xffffff, CONFIG.AMBIENT_INTENSITY);
    activeScene.add(ambientLight);



    originalBasePoints = generateBasePoints(CONFIG.NUM_PINS, CONFIG.SAG_AMPLITUDE);
    activePoints = originalBasePoints.map(p => p.clone());

    const hangingCurve = new THREE.CatmullRomCurve3(activePoints, false, 'catmullrom', 0.5);

    const stringGroup = new THREE.Group();
    activeScene.add(stringGroup);

    if (activeTwistedWire) {
        // DISPOSE old Wire to free GPU memory
        logInit('Disposing old wire...');
        activeTwistedWire.dispose();
    }

    logInit('Creating new Wire object...');
    startTimer('wire-construction');
    activeTwistedWire = new Wire(
        hangingCurve,
        wireColors.A,
        wireColors.B,
        CONFIG.WIRE_THICKNESS,
        CONFIG.WIRE_SEPARATION,
        CONFIG.WIRE_TWISTS,
        activeScene
    );
    endTimer('wire-construction');
    logInit('Wire object created');


    // Fallback to 'CLASSIC' if theme is invalid
    const activeTheme = THEMES[CONFIG.ACTIVE_THEME] ? CONFIG.ACTIVE_THEME : 'CLASSIC';
    const selectedPalette = THEMES[activeTheme].bulbs;
    const numberOfSpans = CONFIG.NUM_PINS - 1;
    const lightsPerSpan = Math.max(1, CONFIG.LIGHTS_PER_SEGMENT);
    const totalLights = numberOfSpans * lightsPerSpan;

    const shuffledColors = [];

    // --- COLOR PERSISTENCE ---
    const currentParams = {
        theme: CONFIG.ACTIVE_THEME,
        count: totalLights
        // avoid-adjacent is now always on, no longer a param
    };

    // Check if we can reuse saved colors
    if (CONFIG.SAVED_COLORS && CONFIG.LAST_COLOR_PARAMS &&
        CONFIG.LAST_COLOR_PARAMS.theme === currentParams.theme &&
        CONFIG.LAST_COLOR_PARAMS.count === currentParams.count) {

        shuffledColors.push(...CONFIG.SAVED_COLORS);
    } else {

        // ALWAYS use avoid-adjacent logic (hard-baked on)
        if (selectedPalette.length > 1) {
            // ROBUST BALANCED SHUFFLE (Retry Logic)
            let success = false;
            let attempts = 0;
            const maxAttempts = 10;

            while (!success && attempts < maxAttempts) {
                attempts++;
                // 1. Build Balanced Deck
                let deck = [];
                const baseCount = Math.floor(totalLights / selectedPalette.length);
                const remainder = totalLights % selectedPalette.length;

                selectedPalette.forEach((color, index) => {
                    const count = baseCount + (index < remainder ? 1 : 0);
                    for (let k = 0; k < count; k++) deck.push(color);
                });

                // 2. Fisher-Yates Shuffle
                for (let i = deck.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [deck[i], deck[j]] = [deck[j], deck[i]];
                }

                // 3. Resolve Adjacency (Swap with future cards)
                for (let i = 1; i < deck.length; i++) {
                    if (deck[i] === deck[i - 1]) {
                        let swapIndex = -1;
                        const candidates = [];
                        for (let j = i + 1; j < deck.length; j++) {
                            const swapCandidate = deck[j];
                            const movingValue = deck[i];

                            // Check 1: Candidate differs from left neighbor at position i
                            if (swapCandidate === deck[i - 1]) continue;

                            // Check 2: Moving value won't match left neighbor at position j
                            if (j > 0 && movingValue === deck[j - 1]) continue;

                            // Check 3: Moving value won't match right neighbor at position j
                            if (j < deck.length - 1 && movingValue === deck[j + 1]) continue;

                            candidates.push(j);
                        }

                        if (candidates.length > 0) {
                            const rnd = Math.floor(Math.random() * candidates.length);
                            swapIndex = candidates[rnd];
                            [deck[i], deck[swapIndex]] = [deck[swapIndex], deck[i]];
                        }
                    }
                }

                // 4. Validate
                let isValid = true;
                for (let i = 1; i < deck.length; i++) {
                    if (deck[i] === deck[i - 1]) {
                        isValid = false;
                        break;
                    }
                }

                if (isValid) {
                    shuffledColors.push(...deck);
                    success = true;
                }
            }

            // Fallback: Strict Alternating
            if (!success) {
                if (debug.enabled) console.warn('⚠️ Balanced shuffle failed 10 times. Using strict fallback.');
                for (let i = 0; i < totalLights; i++) {
                    shuffledColors.push(selectedPalette[i % selectedPalette.length]);
                }
            }
        } else {
            for (let i = 0; i < totalLights; i++) {
                shuffledColors.push(selectedPalette[i % selectedPalette.length]);
            }
            for (let i = shuffledColors.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledColors[i], shuffledColors[j]] = [shuffledColors[j], shuffledColors[i]];
            }
        }

        // Save to cache
        CONFIG.SAVED_COLORS = [...shuffledColors];
        CONFIG.LAST_COLOR_PARAMS = currentParams;
    }

    activeLights = [];
    let lightCounter = 0;

    const spanLength = 1.0 / numberOfSpans;

    logInit(`Creating ${totalLights} bulbs (${numberOfSpans} spans × ${lightsPerSpan} lights)...`);
    startTimer('bulb-creation-loop');

    for (let span = 0; span < numberOfSpans; span++) {
        const startT = span * spanLength;
        const slotSize = spanLength / lightsPerSpan;

        for (let i = 0; i < lightsPerSpan; i++) {
            const t = startT + (slotSize * (i + 0.5));
            const color = shuffledColors[lightCounter % shuffledColors.length];
            // Pass correct wire color based on which wire this bulb attaches to (even=A, odd=B)
            const attachedWireColor = (lightCounter % 2 === 0) ? wireColors.A : wireColors.B;
            const l = createBulbInstance(color, selectedPalette, attachedWireColor);

            l.position.copy(hangingCurve.getPointAt(t));
            l.userData.tLocation = t;

            stringGroup.add(l);
            activeLights.push(l);
            l.userData.wireColorIndex = lightCounter % 2;  // Store which wire color this bulb uses (0=A, 1=B)
            lightCounter++;
        }
    }

    endTimer('bulb-creation-loop');
    logInit(`✅ Created ${activeLights.length} bulbs`);

    activeTwistedWire.setAttachmentPoints(activeLights);

    // Async geometry with progress reporting
    logGeom('Starting async geometry computation');
    startTimer('geometry-async');
    const abortSignal = { cancelled: false };
    window._geometryAbortSignal = abortSignal;

    await activeTwistedWire.updateGeometryAsync(
        (progress) => {
            // Cap at 95% - reserve 100% for when scene is actually visible
            const cappedProgress = Math.min(Math.round(progress * 0.95), 95);
            logGeom(`Progress: ${cappedProgress}%`);
            updateToastProgress(loadingToastId, cappedProgress);
        },
        abortSignal
    );
    endTimer('geometry-async');

    // Check if aborted - exit early if new init was triggered
    if (abortSignal.cancelled) {
        logInit('Geometry aborted - exiting init');
        return;
    }

    logInit('Geometry complete, creating stars/snow...');
    if (CONFIG.STARS_ENABLED) {
        startTimer('create-stars');
        stars = createStars(activeScene);
        endTimer('create-stars');
    }

    if (CONFIG.SNOW_ENABLED) {
        startTimer('create-snow');
        snowParticles = createSnowParticles(activeScene);
        endTimer('create-snow');
    }

    // =========================================
    //  POST-FX INITIALIZATION
    // =========================================
    // Progress stays at 95% through PostFX init (toast will show 100% only after first render)
    logInit('Initializing PostFX...');
    startTimer('postfx-init');
    initPostFX(renderer, activeScene, camera, window.innerWidth, window.innerHeight);
    endTimer('postfx-init');

    // NOTE: Bloom clone loop removed - threshold-based bloom doesn't use separate clones

    // DISABLED: Sparkle system temporarily disabled - coming in future update
    // Initialize particle sparkle system
    // try {
    //     initSparkleSystem(activeScene, activeTwistedWire, activeLights);
    // }

    // Store toast ID to dismiss after first animate frame
    pendingLoadingToast = loadingToastId;

    // Reset loop timer and first-frame flag to prevent delta spike and ensure immediate render
    lastTime = 0;
    window._firstFrameRendered = false;  // Reset so first frame after rebuild renders immediately

    // Reset initialization flag so future calls work
    isInitializing = false;
    endTimer('_initSceneInternal-total');
    endTimer('initScene-total');
    logInit('✅ Scene initialization COMPLETE - geometry built, ready for animation');

    // Check if another init was requested while we were initializing
    if (window._needsReInit !== undefined) {
        logInit('Re-init was requested during init - restarting');
        const forceNew = window._needsReInit;
        window._needsReInit = undefined;
        initScene(forceNew);
        return;
    }

    logInit('Starting animation loop');
    animate(0);
}

// Global time tracking for delta calculation
let lastTime = 0;

// FPS monitoring
let fpsFrameCount = 0;
let fpsLastTime = 0;
let currentFPS = 60;
export function getFPS() { return currentFPS; }

// ═══════════════════════════════════════════════════════════════════════════════
//  ANIMATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update particle systems (snow and stars)
 */
function updateParticles(time) {
    // Snow: create/destroy and animate
    if (CONFIG.SNOW_ENABLED) {
        if (!snowParticles) {
            snowParticles = createSnowParticles(activeScene);
        } else if (shouldRecreateSnow()) {
            activeScene.remove(snowParticles.points);
            snowParticles.geometry.dispose();
            snowParticles = createSnowParticles(activeScene);
        }
        updateSnow(snowParticles, time);
    } else if (snowParticles) {
        activeScene.remove(snowParticles.points);
        snowParticles.geometry.dispose();
        snowParticles = null;
    }

    // Stars: create/destroy and animate
    if (CONFIG.STARS_ENABLED) {
        if (!stars) {
            stars = createStars(activeScene);
        } else if (shouldRecreateStars()) {
            activeScene.remove(stars.points);
            stars.geometry.dispose();
            if (stars.shootingStar) {
                activeScene.remove(stars.shootingStar.line);
                stars.shootingStar.geometry.dispose();
            }
            stars = createStars(activeScene);
        }
        updateStars(stars, time);
    } else if (stars) {
        activeScene.remove(stars.points);
        stars.geometry.dispose();
        stars = null;
    }
}

/**
 * Update wire material colors based on current theme
 */
function updateWireColors() {
    if (activeTwistedWire) {
        const wireColors = WIRE_THEMES[CONFIG.WIRE_THEME] || WIRE_THEMES['CHRISTMAS'];
        if (activeTwistedWire.material1) {
            activeTwistedWire.material1.color.set(wireColors.A);
        }
        if (activeTwistedWire.material2) {
            activeTwistedWire.material2.color.set(wireColors.B);
        }
    }
}

/**
 * Update bulb materials (theme, glass, socket colors)
 */
function updateBulbMaterials() {
    const currentThemeName = CONFIG.ACTIVE_THEME || 'CHRISTMAS';
    const currentThemeData = THEMES[currentThemeName] || THEMES['CHRISTMAS'];
    const currentThemePalette = currentThemeData.bulbs || currentThemeData;
    const wireColors = WIRE_THEMES[CONFIG.WIRE_THEME] || WIRE_THEMES['CHRISTMAS'];

    activeLights.forEach((light, index) => {
        const data = light.userData;
        if (data.glass) {
            data.glass.opacity = CONFIG.GLASS_OPACITY;
            data.glass.roughness = CONFIG.GLASS_ROUGHNESS;

            // Update theme colors when theme name changes
            if (data.currentThemeName !== currentThemeName) {
                data.currentThemeName = currentThemeName;
                const oldPaletteLength = data.themePalette ? data.themePalette.length : 1;
                const newPaletteLength = currentThemePalette.length;
                data.themePalette = currentThemePalette;

                // Redistribute paletteIndex to use full new palette range
                // Use light index to ensure avoid-adjacent pattern
                if (newPaletteLength > oldPaletteLength) {
                    // Palette grew: redistribute to use all new colors
                    data.paletteIndex = index % newPaletteLength;
                } else {
                    // Palette same or shrunk: use modulo to stay in bounds
                    data.paletteIndex = data.paletteIndex % newPaletteLength;
                }

                const newHex = currentThemePalette[data.paletteIndex];
                const newPalette = getBulbPalette(newHex);
                data.glass.color.set(newHex);
                data.glass.emissive.set(newHex);
                data.filament.color.copy(newPalette.filament);
                data.baseFilament.copy(newPalette.filament);
                if (data.baseColor) {
                    data.baseColor.set(newHex);
                }
            }
        }

        // Live socket color update - use correct wire color based on wireColorIndex
        if (data.socketMaterial) {
            if (CONFIG.SOCKET_THEME === 'WIRE_MATCH' || !SOCKET_THEMES[CONFIG.SOCKET_THEME]) {
                // Use correct wire A/B based on which wire this bulb is attached to
                const wireColor = (light.userData.wireColorIndex === 0) ? wireColors.A : wireColors.B;
                data.socketMaterial.color.set(wireColor);
            } else {
                data.socketMaterial.color.set(SOCKET_THEMES[CONFIG.SOCKET_THEME]);
            }
        }
    });
}

/**
 * Update wire sway system (animation, baking, cache)
 * @param {number} t - Current animation time
 */
function updateSwaySystem(t) {
    const hasSway = CONFIG.SWAY_X > 0.001 || CONFIG.SWAY_Z > 0.001;
    const hasSpeed = CONFIG.ANIMATION_SPEED > 0.001;

    if (hasSway && hasSpeed) {
        const tPhase = t * 1.5;

        // Track last phase to avoid redundant updates
        const phaseChanged = (activeTwistedWire._lastPhase === undefined ||
            Math.abs(activeTwistedWire._lastPhase - tPhase) > 0.02);

        if (phaseChanged) {
            activeTwistedWire._lastPhase = tPhase;

            // Direct calculation mode (cache disabled)
            activeTwistedWire.calculatePointsForPhase(tPhase, activePoints, originalBasePoints);
            activeTwistedWire.updateGeometry();
        }
    } else if (hasSway && !hasSpeed) {
        // Sway on but speed is 0 - apply static position
        if (activeTwistedWire.isBaking) {
            activeTwistedWire.isBaking = false;
            if (activeTwistedWire.bakingToastId) {
                dismissToast(activeTwistedWire.bakingToastId);
                activeTwistedWire.bakingToastId = null;
            }
        }
        if (activeTwistedWire.cache && activeTwistedWire.cache.length > 0) {
            activeTwistedWire.clearCache();
        }
        if (activeTwistedWire._lastPhase !== 0) {
            activeTwistedWire._lastPhase = 0;
            activeTwistedWire.calculatePointsForPhase(0, activePoints, originalBasePoints);
            activeTwistedWire.updateGeometry();
        }
    } else {
        // Static Mode (No Sway)
        if (activeTwistedWire.cache && activeTwistedWire.cache.length > 0) {
            activeTwistedWire.clearCache();
            activePoints.forEach((p, i) => p.copy(originalBasePoints[i]));
            activeTwistedWire.sourceCurve.updateArcLengths();
            activeTwistedWire.updateGeometry();
        }
    }
}

/**
 * Update light brightness and color based on ANIMATION_STYLE
 * @param {Object} light - The light parent object
 * @param {number} index - Light index in array (local to span)
 * @param {number} time - Current time (ms)
 * @param {number} deltaTime - Delta time in seconds
 * @param {number} timeFactor - Time factor (delta * 60)
 * @param {number} globalIndex - Light index across ALL spans
 * @param {number} totalLights - Total light count across all spans
 */
function updateLightTwinkle(light, index, time, deltaTime, timeFactor, globalIndex, totalLights) {
    const data = light.userData;
    const style = CONFIG.ANIMATION_STYLE;
    const speed = CONFIG.TWINKLE_SPEED;
    const minI = CONFIG.TWINKLE_MIN_INTENSITY;
    const maxI = CONFIG.TWINKLE_MAX_INTENSITY;

    // Global phase oscillator (shared by all lights)
    if (window.twinkleGlobalPhase === undefined) window.twinkleGlobalPhase = 0;
    if (index === 0) {
        window.twinkleGlobalPhase = (window.twinkleGlobalPhase + speed * 0.5 * deltaTime) % 1.0;
    }

    // Initialize per-light animation state if needed
    if (data.animState === undefined) {
        data.animState = {
            randomPhase: Math.random(),
            nextSparkleTime: time + Math.random() * 2000,
            sparkleOn: false
        };
        // Initialize currentIntensity for smooth transitions
        data.currentIntensity = CONFIG.TWINKLE_MAX_INTENSITY;
    }
    const state = data.animState;

    let targetIntensity = maxI;
    let shouldCycleColor = false;

    // Global color cycle phase (1/4 speed of twinkle for balanced color changes)
    if (window.colorCyclePhase === undefined) window.colorCyclePhase = 0;
    if (index === 0) {
        window.colorCyclePhase = (window.colorCyclePhase + speed * 0.125 * deltaTime) % 1.0;
    }

    // Unified color cycle trigger (all styles except STATIC and COLOR_FADE)
    // COLOR_FADE handles its own smooth interpolation
    if (style !== 'STATIC' && style !== 'COLOR_FADE') {
        const colorCycleInt = Math.floor(window.colorCyclePhase * 2); // 2 cycles per phase loop
        if (data.lastColorCycleInt === undefined) data.lastColorCycleInt = colorCycleInt;
        if (colorCycleInt !== data.lastColorCycleInt && speed > 0.001) {
            shouldCycleColor = true;
            data.lastColorCycleInt = colorCycleInt;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  ANIMATION STYLE DISPATCH
    // ═══════════════════════════════════════════════════════════════════════════

    // Event-based debug logging - only fires when animation settings change
    if (debug.animation && index === 0) {
        const animKey = `${style}|${speed.toFixed(2)}|${minI.toFixed(2)}|${maxI.toFixed(2)}`;
        if (window._lastAnimLogKey !== animKey) {
            window._lastAnimLogKey = animKey;
            logInfo('Animation', `Settings changed → Style: ${style}, Speed: ${speed.toFixed(2)}, MinI: ${minI.toFixed(2)}, MaxI: ${maxI.toFixed(2)}`);
        }
    }

    switch (style) {
        case 'STATIC':
            // No animation - constant max brightness, no color change
            targetIntensity = maxI;
            break;

        case 'SOFT_TWINKLE':
            // Gentle shimmer with random phases per light
            if (speed < 0.001) {
                targetIntensity = maxI;
            } else {
                const phase = (window.twinkleGlobalPhase + state.randomPhase) % 1.0;
                const sine = Math.sin(phase * Math.PI * 2);
                targetIntensity = minI + (maxI - minI) * ((sine + 1) / 2);
            }
            break;

        case 'ALTERNATING':
            // Groups A/B flip-flop (classic Christmas style)
            if (speed < 0.001) {
                targetIntensity = maxI;
            } else {
                const isGroupA = (globalIndex % 2) === 0;
                const groupOffset = isGroupA ? 0 : 0.5;
                const phase = (window.twinkleGlobalPhase + groupOffset) % 1.0;
                const sine = Math.sin(phase * Math.PI * 2);
                targetIntensity = minI + (maxI - minI) * ((sine + 1) / 2);
            }
            break;

        case 'CHASE':
            // Wave travels along entire string (uses globalIndex)
            if (speed < 0.001) {
                targetIntensity = maxI;
            } else {
                const wavePosition = (globalIndex / Math.max(totalLights, 1));
                const phase = (window.twinkleGlobalPhase - wavePosition + 1) % 1.0;
                const sine = Math.sin(phase * Math.PI * 2);
                targetIntensity = minI + (maxI - minI) * Math.max(0, sine);

                // Color cycling uses unified global trigger to maintain avoid-adjacent
            }
            break;

        case 'RANDOM_SPARKLE':
            // Individual random flashes
            if (time >= state.nextSparkleTime) {
                state.sparkleOn = !state.sparkleOn;
                // Random on/off duration: 50-400ms on, 200-1500ms off
                const duration = state.sparkleOn
                    ? 50 + Math.random() * 350
                    : 200 + Math.random() * 1300;
                state.nextSparkleTime = time + duration / (speed * 2 + 0.1);
            }
            targetIntensity = state.sparkleOn ? maxI : minI;
            break;

        case 'COLOR_FADE':
            // Constant brightness, smooth color transitions with hold at each color
            targetIntensity = maxI;

            // Initialize color blend state with hold phase
            if (data.colorBlendState === undefined && data.themePalette) {
                data.colorBlendState = {
                    phase: 0,  // 0-1 = fade, 1-2 = hold
                    prevHex: data.themePalette[data.paletteIndex] || 0xffffff,
                    nextHex: data.themePalette[(data.paletteIndex + 1) % data.themePalette.length] || 0xffffff
                };
            }

            // Advance phase (0→1 fade, 1→2 hold)
            if (speed > 0.001 && data.themePalette && data.themePalette.length > 1 && data.colorBlendState) {
                data.colorBlendState.phase += speed * 0.5 * deltaTime;

                if (data.colorBlendState.phase >= 2.0) {
                    // Completed fade + hold, move to next color
                    data.colorBlendState.phase = 0;
                    data.colorBlendState.prevHex = data.colorBlendState.nextHex;
                    data.paletteIndex = (data.paletteIndex + 1) % data.themePalette.length;
                    data.colorBlendState.nextHex = data.themePalette[data.paletteIndex];
                }

                // Calculate blend factor: fade during phase 0-1, hold at 1 during phase 1-2
                const blendFactor = Math.min(data.colorBlendState.phase, 1.0);

                // Interpolate color using reusable Color objects
                _prevColor.setHex(data.colorBlendState.prevHex);
                _nextColor.setHex(data.colorBlendState.nextHex);
                _blendColor.copy(_prevColor).lerp(_nextColor, blendFactor);

                data.glass.color.copy(_blendColor);
                data.glass.emissive.copy(_blendColor);
                if (data.baseColor) data.baseColor.copy(_blendColor);
            }
            break;

        case 'PARTY':
            // Fast chaotic brightness, faster color cycling than other styles
            if (speed < 0.001) {
                targetIntensity = maxI;
            } else {
                // Reduced chaos factor for more manageable flash speed
                const chaosFactor = 1 + speed * 0.5;
                const fastPhase = (window.twinkleGlobalPhase * chaosFactor + state.randomPhase * 3) % 1.0;
                const chaos = Math.sin(fastPhase * Math.PI * 2) * Math.sin(fastPhase * Math.PI * 3);
                targetIntensity = minI + (maxI - minI) * ((chaos + 1) / 2);

                // PARTY has its own faster color cycling (4x the unified rate)
                const partyColorInt = Math.floor(window.colorCyclePhase * 8);
                if (data.lastPartyColorInt === undefined) data.lastPartyColorInt = partyColorInt;
                if (partyColorInt !== data.lastPartyColorInt) {
                    shouldCycleColor = true;
                    data.lastPartyColorInt = partyColorInt;
                }
            }
            break;

        default:
            targetIntensity = maxI;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  SMOOTH TRANSITION
    // ═══════════════════════════════════════════════════════════════════════════
    const transitionRate = 0.05 + (speed * 0.15);
    const prevIntensity = data.currentIntensity;
    if (data.currentIntensity < targetIntensity) {
        data.currentIntensity = Math.min(data.currentIntensity + transitionRate * timeFactor, targetIntensity);
    } else if (data.currentIntensity > targetIntensity) {
        data.currentIntensity = Math.max(data.currentIntensity - transitionRate * timeFactor, targetIntensity);
    }

    // Event-based animation logging: detect state transitions for each bulb
    // Respects debug.bulbs filter (null = all, array = specific bulbs)
    const shouldLogThisBulb = debug.animation &&
        (debug.bulbs === null || debug.bulbs.includes(index));
    if (shouldLogThisBulb) {
        const wasIncreasing = data._animLogWasIncreasing;
        const isIncreasing = data.currentIntensity > prevIntensity;
        const isDecreasing = data.currentIntensity < prevIntensity;
        const atPeak = prevIntensity > data.currentIntensity && wasIncreasing;
        const atMin = prevIntensity < data.currentIntensity && wasIncreasing === false;

        if (atPeak) {
            logInfo('Animation', `Bulb #${index}: ⬆ PEAK reached (${prevIntensity.toFixed(3)})`);
        }
        if (atMin) {
            logInfo('Animation', `Bulb #${index}: ⬇ MINIMUM reached (${prevIntensity.toFixed(3)})`);
        }

        data._animLogWasIncreasing = isIncreasing ? true : (isDecreasing ? false : wasIncreasing);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  COLOR CYCLING (when triggered by style)
    // ═══════════════════════════════════════════════════════════════════════════
    if (shouldCycleColor && data.themePalette && data.themePalette.length > 1) {
        const oldIndex = data.paletteIndex;
        data.paletteIndex = (data.paletteIndex + 1) % data.themePalette.length;
        const newHex = data.themePalette[data.paletteIndex];
        const newPalette = getBulbPalette(newHex);
        data.glass.color.set(newHex);
        data.glass.emissive.set(newHex);
        data.baseFilament.copy(newPalette.filament);
        if (data.baseColor) data.baseColor.set(newHex);

        // Log color change event (respects logAnimationBulbs filter)
        if (shouldLogThisBulb) {
            logInfo('Animation', `Bulb #${index}: 🎨 COLOR CHANGED: palette[${oldIndex}] → palette[${data.paletteIndex}] (#${newHex.toString(16).padStart(6, '0').toUpperCase()})`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  APPLY FINAL INTENSITY
    // ═══════════════════════════════════════════════════════════════════════════
    const intensity = data.currentIntensity;
    data.glass.emissiveIntensity = CONFIG.EMISSIVE_INTENSITY * intensity;
    data.filament.emissive.copy(data.baseFilament);
    data.filament.emissiveIntensity = intensity;

    // Sync point light if present
    if (data.pointLight) {
        data.pointLight.intensity = intensity * 0.6;
        if (data.baseColor) data.pointLight.color.copy(data.baseColor);
    }
}


export function animate(time) {
    animationFrameId = requestAnimationFrame(animate);

    // Toast dismiss moved to AFTER first render (see end of function)

    // 60 FPS cap - use accumulator pattern
    const targetInterval = 1000 / 60;  // 16.67ms
    if (!window._fpsAccumulator) window._fpsAccumulator = 0;
    if (!window._lastAnimTime) window._lastAnimTime = time;

    // Force first frame to render immediately (skip FPS cap check)
    const isFirstFrame = !window._firstFrameRendered;
    if (isFirstFrame) {
        logInit('🎨 FIRST RENDER - bypassing FPS cap for initial frame');
        window._firstFrameRendered = true;
    } else {
        window._fpsAccumulator += time - window._lastAnimTime;
        window._lastAnimTime = time;

        if (window._fpsAccumulator < targetInterval) {
            return; // Not enough time has passed
        }
        window._fpsAccumulator -= targetInterval;  // Subtract one frame's worth
    }

    // FPS calculation (update every second)
    fpsFrameCount++;
    if (time - fpsLastTime >= 1000) {
        currentFPS = Math.round(fpsFrameCount * 1000 / (time - fpsLastTime));
        fpsFrameCount = 0;
        fpsLastTime = time;
    }

    // Handle Scene Reset / Loop Restart
    if (time === 0 || time < lastTime) {
        lastTime = time;
        fpsLastTime = time;
    }

    // Calculate Delta Time (in seconds)
    const rawDelta = (time - lastTime) / 1000;
    const deltaTime = Math.min(rawDelta, 0.1);
    lastTime = time;

    // Time factor relative to 60FPS
    const timeFactor = deltaTime * 60;

    const t = time * 0.001 * CONFIG.ANIMATION_SPEED;

    // Check if we're currently baking sway cache - pause heavy updates
    const isBakingCache = activeTwistedWire && activeTwistedWire.isBaking;

    // Stats panel toggle and update
    if (CONFIG.STATS_ENABLED) {
        if (!statsPanel) createStatsPanel();
        updateStatsPanel();
    } else if (statsPanel) {
        removeStatsPanel();
    }

    // Live update background toggle
    if (CONFIG.BACKGROUND_ENABLED) {
        if (activeScene.background === null) {
            activeScene.background = new THREE.Color(0x0a1a3a);
            renderer.setClearColor(0x0a1a3a, 1);
        }
    } else {
        if (activeScene.background !== null) {
            activeScene.background = null;
            renderer.setClearColor(0x000000, 0);
        }
    }



    activeScene.rotation.z = Math.sin(t * 0.25) * 0.001;

    // Update particle effects (snow, stars)
    updateParticles(time);

    // Camera live updates
    camera.position.z = CONFIG.CAMERA_DISTANCE;
    camera.position.y = CONFIG.CAMERA_HEIGHT;
    camera.position.x = CONFIG.CAMERA_X;

    // Live material updates (no rebuild needed for these)
    if (ambientLight) {
        ambientLight.intensity = CONFIG.AMBIENT_INTENSITY;
    }

    // Live wire color updates
    updateWireColors();

    // Live bulb theme and glass material updates
    updateBulbMaterials();

    // DISABLED: Sparkle system temporarily disabled - coming in future update
    // Particle sparkle effect for metal themes
    // try {
    //     updateSparkleSystem(time, activeTwistedWire, activeLights);
    // }

    // Update wire sway animation system
    updateSwaySystem(t);

    // 4. Position Lights AT THE DIP POSITIONS (always run)
    activeLights.forEach((light, index) => {
        const u = light.userData.tLocation;

        const isEven = index % 2 === 0;
        const attachedCurve = isEven ? activeTwistedWire.curve1 : activeTwistedWire.curve2;

        const pos = attachedCurve.getPoint(u);
        const tan = attachedCurve.getTangent(u).normalize();

        // Orient the bulb (using reusable vectors to avoid GC)
        _tempUp.set(0, 1, 0);
        _tempRight.crossVectors(_tempUp, tan).normalize();
        _tempDown.crossVectors(tan, _tempRight).normalize();

        light.rotation.set(0, 0, Math.PI);
        light.rotateY((Math.sin(u * 100) - 0.5) * 0.2);
        light.quaternion.setFromUnitVectors(_tempUnitDown, _tempDown);

        // Position bulb, then offset along negative 'down' (bulb's local UP)
        // This moves socket TOP toward wire attachment point
        const socketOffset = 0.3 * CONFIG.BULB_SCALE;
        light.position.copy(pos).addScaledVector(_tempDown, -socketOffset);

        light.updateMatrixWorld();

        // Update twinkle and color cycling (pass globalIndex and total for CHASE style)
        updateLightTwinkle(light, index, time, deltaTime, timeFactor, index, activeLights.length);
    });

    // Sync bloom clone transforms
    syncBloomTransforms(activeLights);

    // Render with post-fx (dual-scene bloom) - always render even during baking
    renderer.info.reset(); // Reset stats before rendering (autoReset is disabled)
    renderWithPostFX(renderer, activeScene, camera);

    // Dismiss loading toast AFTER first successful render (so scene is visible)
    if (pendingLoadingToast) {
        logInit('🎨 FIRST RENDER COMPLETE - dismissing toast now');
        updateToastProgress(pendingLoadingToast, 100);  // Show 100% only when scene is visible
        dismissToast(pendingLoadingToast);
        pendingLoadingToast = null;
    }
}

// Memory cleanup function
export function dispose() {
    // Cancel animation loop
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Dispose snow particles
    if (snowParticles) {
        if (snowParticles.points) activeScene?.remove(snowParticles.points);
        if (snowParticles.geometry) snowParticles.geometry.dispose();
        snowParticles = null;
    }

    // Dispose stars
    if (stars) {
        if (stars.points) activeScene?.remove(stars.points);
        if (stars.geometry) stars.geometry.dispose();
        stars = null;
    }

    // Dispose lights (bulbs)
    if (activeLights) {
        activeLights.forEach(light => {
            if (light.userData) {
                // Dispose glass
                if (light.userData.glass?.geometry) light.userData.glass.geometry.dispose();
                if (light.userData.glass?.material) light.userData.glass.material.dispose();
                // Dispose filament
                if (light.userData.filament?.geometry) light.userData.filament.geometry.dispose();
                if (light.userData.filament?.material) light.userData.filament.material.dispose();
                // Dispose socket
                if (light.userData.socket?.geometry) light.userData.socket.geometry.dispose();
                if (light.userData.socket?.material) light.userData.socket.material.dispose();
            }
            activeScene?.remove(light);
        });
        activeLights = [];
    }

    // Dispose wire (complete cleanup)
    if (activeTwistedWire) {
        activeTwistedWire.dispose();
        activeTwistedWire = null;
    }

    // Dispose renderer
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
}
