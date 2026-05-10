// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                          POST-FX SYSTEM                                   ║
// ║     Dual-scene bloom with alpha preservation for OBS transparency         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/postprocessing/ShaderPass.js';
import { CONFIG } from './config.js';

// ========================================
//  BLOOM SCENE (separate from main scene)
// ========================================
export const sceneBloom = new THREE.Scene();
sceneBloom.background = null;  // Transparent

// ========================================
//  RENDER TARGETS
// ========================================
let rtMain = null;   // Main scene render target
let rtBloom = null;  // Bloom scene render target

function createRenderTargets(width, height) {
    // Dispose old targets if they exist
    if (rtMain) rtMain.dispose();
    if (rtBloom) rtBloom.dispose();

    // Main scene render target (Standard RenderTarget)
    rtMain = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false
    });

    // Bloom render target (FULL resolution for quality)
    rtBloom = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false
    });
}

// ========================================
//  BLOOM COMPOSER
// ========================================
let composerBloom = null;
let bloomPass = null;

function createBloomComposer(renderer, camera, width, height) {
    composerBloom = new EffectComposer(renderer, rtBloom);
    composerBloom.renderToScreen = false;  // Don't render directly to screen

    // Render pass for bloom scene
    composerBloom.addPass(new RenderPass(sceneBloom, camera));

    // UnrealBloom pass (full resolution)
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        CONFIG.BLOOM_STRENGTH,      // strength
        CONFIG.BLOOM_RADIUS,         // radius
        CONFIG.BLOOM_THRESHOLD       // threshold
    );
    composerBloom.addPass(bloomPass);
}

// ========================================
//  COMPOSITE SHADER (Preserves Alpha)
// ========================================
let compositeMaterial = null;
let quadScene = null;
let quadCam = null;

function createCompositeShader() {
    // Quad scene for final composite
    quadScene = new THREE.Scene();
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Composite shader material
    compositeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            tBase: { value: null },               // Main scene texture
            tBloom: { value: null },              // Bloom texture
            bloomIntensity: { value: CONFIG.BLOOM_INTENSITY_COMPOSITE },
            exposure: { value: 1.0 },
            reinhardStrength: { value: 1.0 }
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
            uniform sampler2D tBloom;
            uniform float bloomIntensity;
            uniform float exposure;
            uniform float reinhardStrength;

            // Reinhard tone mapping
            vec3 reinhard(vec3 x) {
                return x / (vec3(1.0) + x);
            }

            void main() {
                vec4 base = texture2D(tBase, vUv);
                vec3 bloom = texture2D(tBloom, vUv).rgb;

                // Combine base + bloom
                vec3 combined = base.rgb + bloom * bloomIntensity;

                // Apply exposure
                combined *= exposure;

                // Apply Reinhard tone mapping to compress highlights
                if (reinhardStrength > 0.001) {
                    combined = mix(combined, reinhard(combined), reinhardStrength);
                }

                // ALPHA FIX: Additive Alpha Calculation
                // Calculate luminance of the bloom
                float bloomLuma = dot(bloom, vec3(0.299, 0.587, 0.114));
                
                // Add bloom brightness to base alpha
                // This ensures glow is visible even on transparent background
                // clamp max alpha to 1.0
                float alpha = clamp(base.a + (bloomLuma * bloomIntensity), 0.0, 1.0);

                gl_FragColor = vec4(combined, alpha);
            }
        `,
        depthWrite: false,
        depthTest: false,
        transparent: true
    });

    // Create full-screen quad
    const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        compositeMaterial
    );
    quad.frustumCulled = false;
    quadScene.add(quad);
}

// ========================================
//  BLOOM CLONE MANAGEMENT
// ========================================
// WeakMap to track which main scene objects have bloom clones
const bloomClonesMap = new WeakMap();

/**
 * Create a bloom clone of a bulb
 * @param {THREE.Object3D} source - Source bulb object from main scene
 * @returns {THREE.Object3D} - Bloom clone (emissive-only)
 */
export function createBloomClone(source) {
    if (!source || !source.isMesh) return null;

    const srcMat = source.material;
    if (!srcMat) return null;

    // 🛑 FOG KILLER: STRICT FILTERING
    // Deny bloom if it is Glass, Wire, or anything that isn't a Filament
    // Filament checks:
    // 1. Must have emissive property
    // 2. emissiveIntensity must be > 0.1
    // 3. Must NOT be 'transparent' or have 'transmission' (Glass)

    // Check if it's the filament (MeshStandardMaterial with high emissive)
    const isFilament = (srcMat.emissive && srcMat.emissiveIntensity > 0.1);

    // Check if it's glass (MeshPhysicalMaterial with transmission)
    const isGlass = (srcMat.transmission > 0 || srcMat.opacity < 0.95);

    // Filter: ONLY Allow Filaments!
    if (!isFilament || isGlass) {
        return null;
    }

    // Determine bloom color based on material
    let bloomColor = new THREE.Color(1, 1, 1);
    let intensity = 1.0;

    bloomColor.copy(srcMat.emissive);
    intensity = srcMat.emissiveIntensity;

    // Apply intensity to color
    bloomColor.multiplyScalar(intensity);

    // Create emissive-only material for bloom
    const bloomMat = new THREE.MeshBasicMaterial({
        color: bloomColor,
        depthWrite: false,      // Don't write to depth buffer
        depthTest: false,       // CRITICAL: Render on top/behind regardless of depth
        transparent: true,      // Required for blending
        blending: THREE.AdditiveBlending, // Accumulate light
        opacity: 1.0            // Full opacity for filament core
    });

    // Create clone mesh
    const clone = new THREE.Mesh(source.geometry, bloomMat);

    // CRITICAL: Use world position/rotation/scale
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

    // Render Order (High priority for filament)
    clone.renderOrder = 1000;

    // Store reference for syncing
    bloomClonesMap.set(source, clone);

    return clone;
}

/**
 * Sync transforms from main scene objects to their bloom clones
 * @param {Array} allLightObjects - All bulb objects from main scene
 */
export function syncBloomTransforms(allLightObjects) {
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();

    allLightObjects.forEach(bulb => {
        bulb.traverse(child => {
            if (child.isMesh) {
                const clone = bloomClonesMap.get(child);
                if (clone) {
                    // Sync world transform
                    child.getWorldPosition(worldPos);
                    child.getWorldQuaternion(worldQuat);
                    child.getWorldScale(worldScale);

                    clone.position.copy(worldPos);
                    clone.quaternion.copy(worldQuat);
                    clone.scale.copy(worldScale);
                }
            }
        });
    });
}

/**
 * Update bloom clone color/intensity from source
 * @param {THREE.Object3D} source - Source bulb
 * @param {THREE.Color} newColor - New color
 * @param {number} intensity - Intensity multiplier
 */
export function updateBloomCloneColor(source, newColor, intensity = 1.0) {
    const clone = bloomClonesMap.get(source);
    if (clone && clone.material) {
        clone.material.color.copy(newColor);
        // Re-apply intensity
        clone.material.color.multiplyScalar(intensity);
        clone.material.needsUpdate = true;
    }
}

// ========================================
//  INITIALIZATION
// ========================================
export function initPostFX(renderer, sceneMain, camera, width, height) {
    console.log('🎨 Initializing Post-FX system (Fog Killer: Filaments Only)...');

    createRenderTargets(width, height);
    createBloomComposer(renderer, camera, width, height);
    createCompositeShader();

    console.log('✅ Post-FX initialized:', {
        bloomStrength: CONFIG.BLOOM_STRENGTH,
        bloomRadius: CONFIG.BLOOM_RADIUS,
        bloomThreshold: CONFIG.BLOOM_THRESHOLD
    });
}

// ========================================
//  RENDER PIPELINE
// ========================================
export function renderWithPostFX(renderer, sceneMain, camera) {
    if (!CONFIG.POSTFX_ENABLED || !composerBloom || !compositeMaterial) {
        // Fast path: just render main scene normally
        renderer.setRenderTarget(null);
        renderer.clear(true, true, true);
        renderer.render(sceneMain, camera);
        return;
    }

    // Update bloom parameters from CONFIG
    if (bloomPass) {
        bloomPass.strength = CONFIG.BLOOM_STRENGTH;
        bloomPass.radius = CONFIG.BLOOM_RADIUS;
        bloomPass.threshold = CONFIG.BLOOM_THRESHOLD;
    }

    if (compositeMaterial) {
        compositeMaterial.uniforms.bloomIntensity.value = CONFIG.BLOOM_INTENSITY_COMPOSITE;
    }

    // Step 1: Render main scene to rtMain (preserves alpha)
    renderer.setRenderTarget(rtMain);
    renderer.clear(true, true, true);
    renderer.render(sceneMain, camera);

    // Step 2: Render bloom scene through composer to rtBloom
    composerBloom.render();

    // Step 3: Composite base + bloom to screen
    compositeMaterial.uniforms.tBase.value = rtMain.texture;
    compositeMaterial.uniforms.tBloom.value = composerBloom.readBuffer.texture;

    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    renderer.render(quadScene, quadCam);
}

// ========================================
//  RESIZE HANDLING
// ========================================
export function resizePostFX(width, height) {
    console.log('🔧 Resizing Post-FX render targets:', width, 'x', height);

    // Recreate render targets with new size
    createRenderTargets(width, height);

    // Update bloom composer size (full resolution)
    if (composerBloom && composerBloom.setSize) {
        composerBloom.setSize(width, height);
    }

    // Update bloom pass size
    if (bloomPass && bloomPass.setSize) {
        bloomPass.setSize(width, height);
    }
}

// ========================================
//  CLEANUP
// ========================================
export function disposePostFX() {
    if (rtMain) {
        rtMain.dispose();
        rtMain = null;
    }
    if (rtBloom) {
        rtBloom.dispose();
        rtBloom = null;
    }
    if (compositeMaterial) {
        compositeMaterial.dispose();
        compositeMaterial = null;
    }
    if (composerBloom) {
        composerBloom = null;
    }
    bloomClonesMap.clear();
    console.log('🗑️ Post-FX resources disposed');
}

// ========================================
//  EXPORTS
// ========================================
export { rtMain, rtBloom, composerBloom, compositeMaterial, bloomPass };
