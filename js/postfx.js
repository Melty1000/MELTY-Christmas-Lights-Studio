// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    POST-FX SYSTEM (TRIPLE-SCENE BLOOM)                   ║
// ║   Independent filament bloom + glass glow with alpha preservation       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG } from './config.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './UnrealBloomPass.js'; // Local patched version with PR #32521 fix
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ========================================
//  SCENES
// ========================================
export const sceneMain = new THREE.Scene();
export const sceneFilamentBloom = new THREE.Scene();
export const sceneGlassGlow = new THREE.Scene();

sceneMain.background = null;
sceneFilamentBloom.background = null;
sceneGlassGlow.background = null;

// ========================================
//  RENDER TARGETS
// ========================================
let rtMain = null;
let rtFilamentBloom = null;
let rtGlassGlow = null;

// ========================================
//  BLOOM COMPOSERS
// ========================================
let composerFilamentBloom = null;
let composerGlassGlow = null;
let bloomPassFilament = null;
let bloomPassGlass = null;

// ========================================
//  COMPOSITE SHADER
// ========================================
let compositeMaterial = null;
let quadScene = null;
let quadCam = null;

// ========================================
//  CLONE TRACKING
// ========================================
const filamentClonesMap = new WeakMap();
const glassClonesMap = new WeakMap();

// ========================================
//  INITIALIZATION
// ========================================
export function initPostFX(renderer, sceneMainRef, camera, width, height) {
    if (!CONFIG.POSTFX_ENABLED) {
        console.log('⚠️ Post-FX disabled via CONFIG');
        return;
    }

    console.log('🎨 Initializing Triple-Scene Bloom System...');

    // Create render targets
    createRenderTargets(width, height);

    // Create bloom composers
    createBloomComposers(renderer, camera, width, height);

    // Create composite shader
    createCompositeShader();

    console.log('✅ Triple-Scene Bloom System initialized');
    console.log(`   - Filament Bloom: ${Math.round(width * 0.75)}x${Math.round(height * 0.75)}`);
    console.log(`   - Glass Glow: ${Math.round(width * 0.5)}x${Math.round(height * 0.5)}`);
}

function createRenderTargets(width, height) {
    // Dispose existing targets
    if (rtMain) rtMain.dispose();
    if (rtFilamentBloom) rtFilamentBloom.dispose();
    if (rtGlassGlow) rtGlassGlow.dispose();

    const rtConfig = {
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType, // Better precision for HDR bloom
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false
        // NO colorSpace - use linear to avoid double-gamma
    };

    // Main scene (full resolution)
    rtMain = new THREE.WebGLRenderTarget(width, height, rtConfig);

    // Filament bloom (75% resolution for performance)
    const bloomScale = 0.75;
    rtFilamentBloom = new THREE.WebGLRenderTarget(
        Math.round(width * bloomScale),
        Math.round(height * bloomScale),
        rtConfig
    );

    // Glass glow (50% resolution - it's soft anyway)
    const glowScale = 0.5;
    rtGlassGlow = new THREE.WebGLRenderTarget(
        Math.round(width * glowScale),
        Math.round(height * glowScale),
        rtConfig
    );
}

function createBloomComposers(renderer, camera, width, height) {
    const bloomScale = 0.75;
    const glowScale = 0.5;

    // FILAMENT BLOOM COMPOSER (tight, intense)
    composerFilamentBloom = new EffectComposer(renderer, rtFilamentBloom);
    composerFilamentBloom.renderToScreen = false;
    composerFilamentBloom.addPass(new RenderPass(sceneFilamentBloom, camera));

    bloomPassFilament = new UnrealBloomPass(
        new THREE.Vector2(Math.round(width * bloomScale), Math.round(height * bloomScale)),
        CONFIG.BLOOM_STRENGTH_FILAMENT || 2.0,
        CONFIG.BLOOM_RADIUS_FILAMENT || 0.4,
        CONFIG.BLOOM_THRESHOLD_FILAMENT || 0.0
    );
    composerFilamentBloom.addPass(bloomPassFilament);

    // GLASS GLOW COMPOSER (wide, soft)
    composerGlassGlow = new EffectComposer(renderer, rtGlassGlow);
    composerGlassGlow.renderToScreen = false;
    composerGlassGlow.addPass(new RenderPass(sceneGlassGlow, camera));

    bloomPassGlass = new UnrealBloomPass(
        new THREE.Vector2(Math.round(width * glowScale), Math.round(height * glowScale)),
        CONFIG.BLOOM_STRENGTH_GLASS || 1.0,
        CONFIG.BLOOM_RADIUS_GLASS || 1.2,
        CONFIG.BLOOM_THRESHOLD_GLASS || 0.0
    );
    composerGlassGlow.addPass(bloomPassGlass);
}

function createCompositeShader() {
    // Create fullscreen quad
    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    compositeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            tBase: { value: null },
            tFilamentBloom: { value: null },
            tGlassGlow: { value: null },
            filamentBloomIntensity: { value: CONFIG.BLOOM_INTENSITY_FILAMENT || 1.0 },
            glassGlowIntensity: { value: CONFIG.BLOOM_INTENSITY_GLASS || 0.5 },
            exposure: { value: CONFIG.EXPOSURE || 1.0 },
            contrast: { value: CONFIG.CONTRAST || 1.05 },
            saturation: { value: CONFIG.SATURATION || 1.1 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `,
        fragmentShader: `
            precision highp float;
            varying vec2 vUv;
            
            uniform sampler2D tBase;
            uniform sampler2D tFilamentBloom;
            uniform sampler2D tGlassGlow;
            uniform float filamentBloomIntensity;
            uniform float glassGlowIntensity;
            uniform float exposure;
            uniform float contrast;
            uniform float saturation;
            
            // Reinhard tone mapping
            vec3 reinhard(vec3 x) {
                return x / (vec3(1.0) + x);
            }
            
            // Saturation adjustment
            vec3 adjustSaturation(vec3 color, float sat) {
                float luma = dot(color, vec3(0.299, 0.587, 0.114));
                return mix(vec3(luma), color, sat);
            }
            
            void main() {
                vec4 base = texture2D(tBase, vUv);
                vec3 filamentBloom = texture2D(tFilamentBloom, vUv).rgb;
                vec3 glassGlow = texture2D(tGlassGlow, vUv).rgb;
                
                // Bloom with intensity control (keep subtle)
                vec3 bloomCombined = filamentBloom * filamentBloomIntensity * 0.5
                    + glassGlow * glassGlowIntensity * 0.3;
                
                // Calculate bloom luminosity for alpha contribution
                float bloomLuma = dot(bloomCombined, vec3(0.299, 0.587, 0.114));
                
                // SUBTLE additive blend - don't overwhelm base
                vec3 combined = base.rgb + bloomCombined * 0.7;
                
                // Simple clamp instead of tone mapping (no dark shadows)
                combined = clamp(combined, 0.0, 1.0);
                
                // SUBTLE alpha: bloom contributes gently to alpha
                float bloomAlpha = clamp(bloomLuma * 0.8, 0.0, 1.0);
                float finalAlpha = max(base.a, bloomAlpha);
                
                gl_FragColor = vec4(combined, finalAlpha);
            }
        `,
        depthWrite: false,
        depthTest: false,
        transparent: true
    });

    const quadMesh = new THREE.Mesh(quadGeometry, compositeMaterial);
    quadScene = new THREE.Scene();
    quadScene.add(quadMesh);
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

// ========================================
//  BLOOM CLONE CREATION
// ========================================
export function createFilamentBloomClone(source) {
    if (!source || !source.isMesh) return null;

    const srcMat = source.material;
    if (!srcMat) return null;

    // Check for bulb glass material (has isBulbMaterial flag)
    // OR check for MeshBasicMaterial with bright color (filament)
    const isBulbGlass = srcMat.userData && srcMat.userData.isBulbMaterial;
    const isFilament = srcMat.isMeshBasicMaterial && !isBulbGlass;

    // Only create bloom for bulb glass (not filament, socket, or wire)
    if (!isBulbGlass) return null;

    // Use the material's COLOR (not emissive) - this is the actual bulb color
    const bloomColor = srcMat.color.clone();

    // SUBTLE bloom - don't over-boost
    const intensity = 0.5;

    const bloomMat = new THREE.MeshBasicMaterial({
        color: bloomColor.multiplyScalar(intensity),
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const clone = new THREE.Mesh(source.geometry, bloomMat);

    // Sync world transform
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();

    source.getWorldPosition(worldPos);
    source.getWorldQuaternion(worldQuat);
    source.getWorldScale(worldScale);

    clone.position.copy(worldPos);
    clone.quaternion.copy(worldQuat);
    clone.scale.copy(worldScale);
    clone.matrixAutoUpdate = true;

    filamentClonesMap.set(source, clone);
    return clone;
}

export function createGlassGlowClone(source) {
    if (!source || !source.isMesh) return null;

    const srcMat = source.material;
    if (!srcMat) return null;

    // Check for bulb glass material
    const isBulbGlass = srcMat.userData && srcMat.userData.isBulbMaterial;

    if (!isBulbGlass) return null;

    // Create soft glow clone using material color
    const glowColor = srcMat.color.clone();
    glowColor.multiplyScalar(0.3); // Very soft for glass glow

    const glowMat = new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.3,  // Subtle
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const clone = new THREE.Mesh(source.geometry, glowMat);

    // Sync world transform
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();

    source.getWorldPosition(worldPos);
    source.getWorldQuaternion(worldQuat);
    source.getWorldScale(worldScale);

    clone.position.copy(worldPos);
    clone.quaternion.copy(worldQuat);
    clone.scale.copy(worldScale);
    clone.matrixAutoUpdate = true;

    glassClonesMap.set(source, clone);
    return clone;
}

// Backward compatibility - routes to filament bloom
export function createBloomClone(source) {
    return createFilamentBloomClone(source);
}

// ========================================
//  TRANSFORM SYNC
// ========================================
export function syncBloomTransforms(allLightObjects) {
    if (!allLightObjects) return;

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();

    allLightObjects.forEach(bulb => {
        bulb.traverse(child => {
            if (child.isMesh) {
                // Sync filament clones
                const filamentClone = filamentClonesMap.get(child);
                if (filamentClone) {
                    child.getWorldPosition(worldPos);
                    child.getWorldQuaternion(worldQuat);
                    child.getWorldScale(worldScale);

                    filamentClone.position.copy(worldPos);
                    filamentClone.quaternion.copy(worldQuat);
                    filamentClone.scale.copy(worldScale);
                }

                // Sync glass clones
                const glassClone = glassClonesMap.get(child);
                if (glassClone) {
                    child.getWorldPosition(worldPos);
                    child.getWorldQuaternion(worldQuat);
                    child.getWorldScale(worldScale);

                    glassClone.position.copy(worldPos);
                    glassClone.quaternion.copy(worldQuat);
                    glassClone.scale.copy(worldScale);
                }
            }
        });
    });
}

// ========================================
//  COLOR UPDATE
// ========================================
export function updateBloomCloneColor(source, newColor, intensity = 1.0) {
    const filamentClone = filamentClonesMap.get(source);
    if (filamentClone && filamentClone.material) {
        const bloomColor = newColor.clone();
        bloomColor.multiplyScalar(intensity);
        filamentClone.material.color.copy(bloomColor);
    }

    const glassClone = glassClonesMap.get(source);
    if (glassClone && glassClone.material) {
        const glowColor = newColor.clone();
        glowColor.multiplyScalar(0.3); // Attenuation
        glassClone.material.color.copy(glowColor);
    }
}

// ========================================
//  RENDER PIPELINE
// ========================================
export function renderWithPostFX(renderer, sceneMainRef, camera) {
    if (!CONFIG.POSTFX_ENABLED || !composerFilamentBloom || !composerGlassGlow) {
        // Fallback: render main scene only
        renderer.setRenderTarget(null);
        renderer.clear(true, true, true);
        renderer.render(sceneMainRef, camera);
        return;
    }

    // Update bloom parameters from CONFIG
    // UI uses simple keys (BLOOM_STRENGTH), we also support _FILAMENT/_GLASS variants
    // Use ?? (nullish coalescing) so 0 is treated as valid, not falsy
    if (bloomPassFilament) {
        bloomPassFilament.strength = CONFIG.BLOOM_STRENGTH ?? CONFIG.BLOOM_STRENGTH_FILAMENT ?? 2.0;
        bloomPassFilament.radius = CONFIG.BLOOM_RADIUS ?? CONFIG.BLOOM_RADIUS_FILAMENT ?? 0.4;
        bloomPassFilament.threshold = CONFIG.BLOOM_THRESHOLD ?? CONFIG.BLOOM_THRESHOLD_FILAMENT ?? 0.0;
    }

    if (bloomPassGlass) {
        bloomPassGlass.strength = (CONFIG.BLOOM_STRENGTH ?? CONFIG.BLOOM_STRENGTH_GLASS ?? 1.0) * 0.6;
        bloomPassGlass.radius = (CONFIG.BLOOM_RADIUS ?? CONFIG.BLOOM_RADIUS_GLASS ?? 1.2) * 1.5;
        bloomPassGlass.threshold = CONFIG.BLOOM_THRESHOLD ?? CONFIG.BLOOM_THRESHOLD_GLASS ?? 0.0;
    }

    if (compositeMaterial) {
        compositeMaterial.uniforms.filamentBloomIntensity.value =
            CONFIG.BLOOM_INTENSITY ?? CONFIG.BLOOM_INTENSITY_FILAMENT ?? 1.0;
        compositeMaterial.uniforms.glassGlowIntensity.value =
            CONFIG.GLASS_GLOW_ENABLED !== false ?
                ((CONFIG.BLOOM_INTENSITY ?? CONFIG.BLOOM_INTENSITY_GLASS ?? 0.5) * 0.6) : 0.0;
        compositeMaterial.uniforms.exposure.value = CONFIG.EXPOSURE ?? 1.0;
        compositeMaterial.uniforms.contrast.value = CONFIG.CONTRAST ?? 1.05;
        compositeMaterial.uniforms.saturation.value = CONFIG.SATURATION ?? 1.1;
    }

    // STEP 1: Render main scene
    renderer.setRenderTarget(rtMain);
    renderer.clear(true, true, true);
    renderer.render(sceneMainRef, camera);

    // STEP 2: Render filament bloom
    composerFilamentBloom.render();

    // STEP 3: Render glass glow (if enabled)
    if (CONFIG.GLASS_GLOW_ENABLED) {
        composerGlassGlow.render();
    }

    // STEP 4: Composite all three to screen
    compositeMaterial.uniforms.tBase.value = rtMain.texture;
    compositeMaterial.uniforms.tFilamentBloom.value =
        composerFilamentBloom.readBuffer.texture;
    compositeMaterial.uniforms.tGlassGlow.value =
        composerGlassGlow.readBuffer.texture;

    renderer.setRenderTarget(null);
    renderer.clear(true, true, false); // Don't clear alpha!
    renderer.render(quadScene, quadCam);
}

// ========================================
//  RESIZE
// ========================================
export function resizePostFX(width, height) {
    if (!rtMain) return;

    createRenderTargets(width, height);

    if (composerFilamentBloom) {
        composerFilamentBloom.setSize(
            Math.round(width * 0.75),
            Math.round(height * 0.75)
        );
    }

    if (composerGlassGlow) {
        composerGlassGlow.setSize(
            Math.round(width * 0.5),
            Math.round(height * 0.5)
        );
    }

    console.log(`📐 Post-FX resized to ${width}x${height}`);
}

// ========================================
//  CLEANUP
// ========================================
export function disposePostFX() {
    if (rtMain) rtMain.dispose();
    if (rtFilamentBloom) rtFilamentBloom.dispose();
    if (rtGlassGlow) rtGlassGlow.dispose();

    if (composerFilamentBloom) composerFilamentBloom.dispose();
    if (composerGlassGlow) composerGlassGlow.dispose();

    if (compositeMaterial) compositeMaterial.dispose();

    console.log('🗑️ Post-FX system disposed');
}
