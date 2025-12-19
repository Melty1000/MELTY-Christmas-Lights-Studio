// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                          CAMERA SYSTEM                                    ║
// ║  Base+Offset camera positioning with aspect ratio scaling                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG } from './config.js';
import { logInfo } from './debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Reference Extremes & Resolution
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
//  Camera State Initialization
// ═══════════════════════════════════════════════════════════════════════════════

// Initialize global camera state
if (typeof window !== 'undefined') {
    window.cameraBase = { distance: 0, height: 0, pan: 0 };
    window.cameraOffset = { distance: 0, height: 0, pan: 0 };
    window.cameraExtremes = {
        distance: { min: 0, max: 0 },
        height: { min: 0, max: 0 },
        pan: { min: 0, max: 0 }
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  calculateScaledCamera
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
//  updateCameraBase
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
//  sliderToOffset
// ═══════════════════════════════════════════════════════════════════════════════

// Convert slider value (0-100) to camera offset
export function sliderToOffset(sliderValue, extremes) {
    const normalized = (sliderValue - 50) / 50; // -1 to +1
    const range = extremes.max - extremes.min;
    return (normalized * range) / 2;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  applyFinalPosition
// ═══════════════════════════════════════════════════════════════════════════════

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
