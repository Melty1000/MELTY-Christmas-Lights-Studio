// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                   SECTION 5: SCENE & RENDERER                             ║
// ║            initScene, animate, onWindowResize, render loop                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG, THEMES, WIRE_THEMES } from './config.js';
import { updateCameraBase, applyFinalPosition } from './config.js';
import { getBulbPalette } from './utils.js';
import { Wire, createBulbInstance, createStars, createSnowParticles, updateSnow, generateBasePoints } from './geometry.js';
import { initPostFX, sceneFilamentBloom, sceneGlassGlow, createFilamentBloomClone, createGlassGlowClone, syncBloomTransforms, renderWithPostFX, resizePostFX } from './postfx.js';

// Declare mutable globals locally (can't import them - imports are read-only)
let container, renderer, camera;
let animationFrameId = null;
let activeScene, activeLights, activeTwistedWire;
let activePoints = [];
let originalBasePoints = [];
let stars = null;
let snowParticles = null;

// Export these so other modules can access them
export { container, renderer, camera, animationFrameId, activeScene, activeLights, activeTwistedWire, activePoints, originalBasePoints, stars, snowParticles };

// =========================================
//  SCENE LOGIC
// =========================================

export function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Resize post-fx render targets
        resizePostFX(window.innerWidth, window.innerHeight);
    }
}

export function initScene() {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    if (activeScene) {
        activeScene.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                Array.isArray(child.material) ? child.material.forEach(m => m.dispose()) : child.material.dispose();
            }
        });
    }

    if (!container) {
        container = document.getElementById('canvas-container');
        camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(CONFIG.CAMERA_X || 0, CONFIG.CAMERA_HEIGHT, CONFIG.CAMERA_DISTANCE);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Restore tone mapping for proper wire/socket brightness
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Manual clear control for bloom compositing
        renderer.autoClear = false;

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
        camera.position.set(CONFIG.CAMERA_X || 0, CONFIG.CAMERA_HEIGHT, CONFIG.CAMERA_DISTANCE);
    }
    if (renderer.domElement.parentNode !== container) {
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
    }
    onWindowResize();

    activeScene = new THREE.Scene();

    if (CONFIG.BACKGROUND_ENABLED) {
        activeScene.background = new THREE.Color(0x0a1a3a);
        renderer.setClearColor(0x0a1a3a, 1);
    } else {
        activeScene.background = null;
        renderer.setClearColor(0x000000, 0);
    }

    const wireColors = WIRE_THEMES[CONFIG.WIRE_THEME] || WIRE_THEMES['CHRISTMAS_PAIR'];

    activeScene.add(new THREE.AmbientLight(0xffffff, CONFIG.AMBIENT_INTENSITY));

    if (CONFIG.SHADOWS_ENABLED) {
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
        dirLight.position.set(5, 10, 5);
        dirLight.castShadow = true;
        dirLight.shadow.camera.left = -15;
        dirLight.shadow.camera.right = 15;
        dirLight.shadow.camera.top = 15;
        dirLight.shadow.camera.bottom = -15;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 40;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.bias = -0.001;
        activeScene.add(dirLight);
    }

    originalBasePoints = generateBasePoints(CONFIG.NUM_PINS, CONFIG.SAG_AMPLITUDE);
    activePoints = originalBasePoints.map(p => p.clone());

    const hangingCurve = new THREE.CatmullRomCurve3(activePoints, false, 'catmullrom', 0.5);

    const stringGroup = new THREE.Group();
    activeScene.add(stringGroup);

    activeTwistedWire = new Wire(
        hangingCurve,
        wireColors.A,
        wireColors.B,
        CONFIG.WIRE_THICKNESS,
        CONFIG.WIRE_SEPARATION,
        CONFIG.WIRE_TWISTS,
        activeScene
    );

    const selectedPalette = THEMES[CONFIG.ACTIVE_THEME].bulbs;
    const numberOfSpans = CONFIG.NUM_PINS - 1;
    const lightsPerSpan = Math.max(1, CONFIG.LIGHTS_PER_SEGMENT);
    const totalLights = numberOfSpans * lightsPerSpan;

    const shuffledColors = [];

    // --- COLOR PERSISTENCE ---
    const currentParams = {
        theme: CONFIG.ACTIVE_THEME,
        count: totalLights,
        avoid: CONFIG.AVOID_ADJACENT_COLORS
    };

    // Check if we can reuse saved colors
    if (CONFIG.SAVED_COLORS && CONFIG.LAST_COLOR_PARAMS &&
        CONFIG.LAST_COLOR_PARAMS.theme === currentParams.theme &&
        CONFIG.LAST_COLOR_PARAMS.count === currentParams.count &&
        CONFIG.LAST_COLOR_PARAMS.avoid === currentParams.avoid) {

        console.log('♻️ Reusing saved bulb colors (Settings change detected)');
        shuffledColors.push(...CONFIG.SAVED_COLORS);
    } else {
        console.log('🎨 Generating NEW bulb colors');

        if (CONFIG.AVOID_ADJACENT_COLORS && selectedPalette.length > 1) {
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
                            if (deck[j] !== deck[i - 1]) {
                                candidates.push(j);
                            }
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
                    console.log(`✅ Balanced shuffle successful on attempt ${attempts}`);
                }
            }

            // Fallback: Strict Alternating
            if (!success) {
                console.warn('⚠️ Balanced shuffle failed 10 times. Using strict fallback.');
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

    for (let span = 0; span < numberOfSpans; span++) {
        const startT = span * spanLength;
        const slotSize = spanLength / lightsPerSpan;

        for (let i = 0; i < lightsPerSpan; i++) {
            const t = startT + (slotSize * (i + 0.5));
            const color = shuffledColors[lightCounter % shuffledColors.length];
            const l = createBulbInstance(color, selectedPalette, wireColors.A);

            l.position.copy(hangingCurve.getPointAt(t));
            l.userData.tLocation = t;

            stringGroup.add(l);
            activeLights.push(l);
            lightCounter++;
        }
    }

    activeTwistedWire.setAttachmentPoints(activeLights);
    activeTwistedWire.updateGeometry();
    // Force clear cache on new scene to prevent buffer mismatch
    activeTwistedWire.clearCache();

    if (CONFIG.STARS_ENABLED) {
        stars = createStars(activeScene);
    }

    if (CONFIG.SNOW_ENABLED) {
        snowParticles = createSnowParticles(activeScene);
    }

    // =========================================
    //  POST-FX INITIALIZATION
    // =========================================
    initPostFX(renderer, activeScene, camera, window.innerWidth, window.innerHeight);

    // Create bloom clones for all bulbs with emissive materials
    console.log('🎨 Creating triple-scene bloom clones for', activeLights.length, 'bulbs...');
    sceneFilamentBloom.clear(); // Clear any previous filament clones
    sceneGlassGlow.clear(); // Clear any previous glass clones

    let filamentCloneCount = 0;
    let glassCloneCount = 0;

    activeLights.forEach(bulb => {
        bulb.traverse(child => {
            if (child.isMesh) {
                // Create filament bloom clone (tight, intense)
                const filamentClone = createFilamentBloomClone(child);
                if (filamentClone) {
                    sceneFilamentBloom.add(filamentClone);
                    filamentCloneCount++;
                }

                // Create glass glow clone (wide, soft)
                const glassClone = createGlassGlowClone(child);
                if (glassClone) {
                    sceneGlassGlow.add(glassClone);
                    glassCloneCount++;
                }
            }
        });
    });

    console.log(`✅ Triple-scene bloom initialized:`);
    console.log(`   - ${filamentCloneCount} filament bloom clones`);
    console.log(`   - ${glassCloneCount} glass glow clones`);

    // Reset loop timer to prevent delta spike
    lastTime = 0;
    animate(0);
}

// Global time tracking for delta calculation
let lastTime = 0;

export function animate(time) {
    animationFrameId = requestAnimationFrame(animate);

    // Handle Scene Reset / Loop Restart
    if (time === 0 || time < lastTime) {
        lastTime = time;
    }

    // Calculate Delta Time (in seconds)
    const rawDelta = (time - lastTime) / 1000;
    const deltaTime = Math.min(rawDelta, 0.1);
    lastTime = time;

    // Time factor relative to 60FPS
    const timeFactor = deltaTime * 60;

    const t = time * 0.001 * CONFIG.ANIMATION_SPEED;

    activeScene.rotation.z = Math.sin(t * 0.25) * 0.001;

    if (CONFIG.SNOW_ENABLED && snowParticles) {
        updateSnow(snowParticles, time);
    }

    // 1. Update Curve Control Points (Sway)
    if (CONFIG.SWAY_X > 0.001 || CONFIG.SWAY_Z > 0.001) {
        const tPhase = t * 1.5;

        activeTwistedWire.calculatePointsForPhase(tPhase, activePoints, originalBasePoints);

        if ((!activeTwistedWire.cache || activeTwistedWire.cache.length === 0) && !activeTwistedWire.isBaking) {
            activeTwistedWire.startBaking();
        }

        if (activeTwistedWire.isBaking) {
            activeTwistedWire.processBakingStep(activePoints, originalBasePoints);
            activeTwistedWire.updateGeometry();
        } else {
            const success = activeTwistedWire.updateFromCache(tPhase);
            if (!success) {
                activeTwistedWire.updateGeometry();
            }
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

    // 4. Position Lights AT THE DIP POSITIONS
    activeLights.forEach((light, index) => {
        const u = light.userData.tLocation;

        const isEven = index % 2 === 0;
        const attachedCurve = isEven ? activeTwistedWire.curve1 : activeTwistedWire.curve2;

        const pos = attachedCurve.getPoint(u);
        const tan = attachedCurve.getTangent(u).normalize();

        light.position.copy(pos);

        // Orient the bulb
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(up, tan).normalize();
        const down = new THREE.Vector3().crossVectors(tan, right).normalize();

        light.rotation.set(0, 0, Math.PI);
        light.rotateY((Math.sin(u * 100) - 0.5) * 0.2);
        light.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);

        light.updateMatrixWorld();

        // Twinkle logic
        const data = light.userData;

        const baseSpeed = CONFIG.TWINKLE_SPEED;

        if (data.state === 'HOLD') {
            data.timer -= deltaTime;
            if (data.timer <= 0) {
                data.state = 'TRANSITION';
                if (data.currentIntensity > 0.5) {
                    data.targetIntensity = CONFIG.TWINKLE_MIN_INTENSITY;
                    data.step = baseSpeed * (0.5 + Math.random() * CONFIG.TWINKLE_RANDOMNESS);
                } else {
                    data.targetIntensity = 1.0;
                    data.step = baseSpeed * (0.75 + Math.random() * CONFIG.TWINKLE_RANDOMNESS * 0.5);
                    if (CONFIG.COLOR_CYCLING_ENABLED) {
                        data.paletteIndex = (data.paletteIndex + 1) % data.themePalette.length;
                        const newHex = data.themePalette[data.paletteIndex];
                        const newPalette = getBulbPalette(newHex);
                        data.glass.color.set(newHex);
                        data.glass.emissive.set(newHex);
                        data.filament.color.copy(newPalette.filament);
                        data.baseFilament.copy(newPalette.filament);
                    }
                }
            }
        } else if (data.state === 'TRANSITION') {
            const change = data.step * timeFactor;

            if (data.currentIntensity < data.targetIntensity) {
                data.currentIntensity += change;
                if (data.currentIntensity >= data.targetIntensity) {
                    data.currentIntensity = data.targetIntensity;
                    data.state = 'HOLD';
                    data.timer = 1.0 + Math.random() * 4.0;
                }
            } else {
                data.currentIntensity -= change;
                if (data.currentIntensity <= data.targetIntensity) {
                    data.currentIntensity = data.targetIntensity;
                    data.state = 'HOLD';
                    data.timer = 0.2 + Math.random() * 0.8;
                }
            }
        }
        const intensity = data.currentIntensity;
        data.glass.emissiveIntensity = CONFIG.EMISSIVE_INTENSITY * intensity;
        data.filament.color.copy(data.baseFilament).multiplyScalar(intensity);
    });

    // Sync bloom clone transforms
    syncBloomTransforms(activeLights);

    // Render with post-fx (dual-scene bloom)
    renderWithPostFX(renderer, activeScene, camera);
}
