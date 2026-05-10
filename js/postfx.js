// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                          POST-FX SYSTEM                                    ║
// ║     Threshold-based Selective Bloom for Christmas Lights                  ║
// ║     Uses UnrealBloomPass with high threshold to only bloom emissives      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CONFIG } from './config.js';
import { logInfo, logPerf, startTimer, endTimer } from './debug.js';

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE STATE
// ═══════════════════════════════════════════════════════════════════════════

let composer = null;
let bloomPass = null;
let renderTarget = null;

// Render stats for external access (captured after each render)
export const lastRenderInfo = { calls: 0, triangles: 0 };

// Legacy exports for compatibility (bloom scene not used in threshold approach)
export const sceneBloom = new THREE.Scene();
sceneBloom.background = null;

// ═══════════════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export function initPostFX(renderer, sceneMain, camera, width, height) {
    logInfo('PostFX', 'initPostFX() called', { width, height });
    startTimer('postfx-full-init');

    // Dispose any existing resources
    disposePostFX();

    // Create render target with alpha support for transparent backgrounds
    // Note: samples = 8 for high quality MSAA (16x rarely supported in WebGL)
    logInfo('PostFX', 'Creating WebGLRenderTarget with MSAA...');
    renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,  // HDR for better bloom quality
        samples: 8                   // MSAA for edge quality (8x is widely supported)
    });

    // Create the effect composer
    logInfo('PostFX', 'Creating EffectComposer...');
    composer = new EffectComposer(renderer, renderTarget);
    composer.setSize(width, height);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Pass 1: Render the scene
    const renderPass = new RenderPass(sceneMain, camera);
    renderPass.clearAlpha = 0;  // Preserve alpha for transparency
    composer.addPass(renderPass);

    // Pass 2: Bloom with HIGH THRESHOLD (only affects bright/emissive elements)
    // Threshold of 0.8-1.0 means only very bright pixels (emissive filaments) will bloom
    logInfo('PostFX', 'Creating UnrealBloomPass...', {
        strength: CONFIG.BLOOM_STRENGTH ?? 1.2,
        radius: CONFIG.BLOOM_RADIUS ?? 0.6,
        threshold: CONFIG.BLOOM_THRESHOLD ?? 0.8
    });
    bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        CONFIG.BLOOM_STRENGTH ?? 1.2,     // Strength (use ?? to allow 0)
        CONFIG.BLOOM_RADIUS ?? 0.6,       // Radius (use ?? to allow 0)
        CONFIG.BLOOM_THRESHOLD ?? 0.8     // High threshold = only emissives bloom
    );
    composer.addPass(bloomPass);

    // Pass 3: Output pass (handles tone mapping and color space)
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    endTimer('postfx-full-init');
    logInfo('PostFX', '✅ PostFX initialization complete');
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function renderWithPostFX(renderer, sceneMain, camera) {
    if (!CONFIG.POSTFX_ENABLED || !composer) {
        // Bypass post-fx, render directly
        renderer.setRenderTarget(null);
        renderer.clear(true, true, true);
        renderer.render(sceneMain, camera);
        // Capture stats from direct render
        lastRenderInfo.calls = renderer.info.render.calls;
        lastRenderInfo.triangles = renderer.info.render.triangles;
        return;
    }

    // Update bloom parameters from CONFIG (allows real-time slider updates)
    if (bloomPass) {
        // BLOOM_INTENSITY multiplies with BLOOM_STRENGTH for final output
        const baseStrength = CONFIG.BLOOM_STRENGTH ?? 1.2;
        const intensity = CONFIG.BLOOM_INTENSITY ?? 1.0;
        const effectiveStrength = baseStrength * intensity;

        // Disable bloom pass entirely when strength is 0 (UnrealBloomPass has undefined behavior at 0)
        bloomPass.enabled = effectiveStrength > 0.001;
        bloomPass.strength = effectiveStrength;
        bloomPass.radius = CONFIG.BLOOM_RADIUS ?? 0.6;
        bloomPass.threshold = CONFIG.BLOOM_THRESHOLD ?? 0.8;
    }

    // Reset render target to prevent feedback loops
    renderer.setRenderTarget(null);

    // Render through the composer
    composer.render();

    // Store render stats for external access
    lastRenderInfo.calls = renderer.info.render.calls;
    lastRenderInfo.triangles = renderer.info.render.triangles;
}

// ═══════════════════════════════════════════════════════════════════════════
//  RESIZE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export function resizePostFX(width, height) {
    if (composer) {
        composer.setSize(width, height);
    }
    if (bloomPass) {
        bloomPass.resolution.set(width, height);
    }
    if (renderTarget) {
        renderTarget.setSize(width, height);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

export function disposePostFX() {
    if (bloomPass) {
        // Dispose bloom pass render targets
        if (bloomPass.renderTargetsHorizontal) {
            bloomPass.renderTargetsHorizontal.forEach(rt => rt.dispose());
        }
        if (bloomPass.renderTargetsVertical) {
            bloomPass.renderTargetsVertical.forEach(rt => rt.dispose());
        }
        if (bloomPass.renderTargetBright) {
            bloomPass.renderTargetBright.dispose();
        }
        bloomPass = null;
    }
    if (composer) {
        composer.dispose();
        composer = null;
    }
    if (renderTarget) {
        renderTarget.dispose();
        renderTarget = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEGACY STUB FUNCTIONS (for compatibility with existing code)
// ═══════════════════════════════════════════════════════════════════════════

export function createBloomClone(source) {
    // Not needed for threshold-based bloom - return null
    return null;
}

export function syncBloomTransforms(allLightObjects) {
    // Not needed for threshold-based bloom - no-op
}

export function updateBloomCloneColor(source, newColor, intensity = 1.0) {
    // Not needed for threshold-based bloom - no-op
}

// Legacy exports for compatibility
export const rtMain = null;
export const rtBloom = null;
export const composerBloom = null;
export const compositeMaterial = null;
export { bloomPass };
