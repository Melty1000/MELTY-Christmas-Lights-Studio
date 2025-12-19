// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    SECTION 7: INITIALIZATION                              ║
// ║                Main entry point - window load, camera init                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { loadConfig, CONFIG, REFERENCE_RESOLUTION, updateCameraBase, applyFinalPosition, validateConfig } from './config.js';
import { setupUI } from './ui.js';
import { initScene, getFPS, dispose } from './renderer.js';
import { camera, renderer, activeScene } from './renderer.js';
import { initAutoUpdate } from './auto-update.js';
import { logInfo, logPerf, startTimer, endTimer } from './debug.js';

// Create namespace for globals (fixes window.* pollution)
window.ChristmasLights = window.ChristmasLights || {
    version: '1.0.0',
    getFPS: () => getFPS(),
    dispose: () => dispose(),
    CONFIG: CONFIG
};

// Initialize everything on page load (guard against multiple listeners)
if (!window.ChristmasLights._loadListenerAdded) {
    window.ChristmasLights._loadListenerAdded = true;
    window.addEventListener('load', () => {
        logInfo('Main', '🚀 APPLICATION STARTUP - window.load fired');
        startTimer('app-startup-total');

        startTimer('loadConfig');
        loadConfig(); // Load saved settings
        endTimer('loadConfig');

        startTimer('validateConfig');
        validateConfig(); // Validate bounds
        endTimer('validateConfig');

        startTimer('setupUI');
        setupUI();
        endTimer('setupUI');

        logInfo('Main', 'Calling initScene()...');
        startTimer('initScene-from-main');
        initScene();
        // Note: initScene is async, timer won't capture full duration

        // Initialize camera system with default values (use namespace)
        window.ChristmasLights.cameraData = {
            distance: CONFIG.CAMERA_DISTANCE || 14,
            height: CONFIG.CAMERA_HEIGHT || 0,
            pan: CONFIG.CAMERA_X || 0,
            refAspect: REFERENCE_RESOLUTION.aspect,
            refVisibleHeight: 2 * Math.tan((40 * Math.PI / 180) / 2) * (CONFIG.CAMERA_DISTANCE || 14),
            refVisibleWidth: 2 * Math.tan((40 * Math.PI / 180) / 2) * (CONFIG.CAMERA_DISTANCE || 14) * REFERENCE_RESOLUTION.aspect
        };
        // Keep legacy reference for backwards compatibility
        window.lastLoadedCameraData = window.ChristmasLights.cameraData;

        updateCameraBase();
        logInfo('Main', 'Camera base updated');

        // Restore saved camera offset (CONFIG values minus calculated base)
        // This ensures refresh preserves user's camera position
        const savedDistance = CONFIG.CAMERA_DISTANCE ?? 14;
        const savedHeight = CONFIG.CAMERA_HEIGHT ?? 0;
        const savedPan = CONFIG.CAMERA_X ?? 0;
        window.cameraOffset.distance = savedDistance - window.cameraBase.distance;
        window.cameraOffset.height = savedHeight - window.cameraBase.height;
        window.cameraOffset.pan = savedPan - window.cameraBase.pan;

        applyFinalPosition(camera, renderer, activeScene);
        logInfo('Main', 'Camera position applied');

        // Initialize auto-update checker (checks GitHub hourly)
        initAutoUpdate();

        endTimer('app-startup-total');
        logInfo('Main', '✅ Application startup sequence complete (scene init is async)');

        // NOTE: Resize handler is in renderer.js (includes post-fx resize)
    });
}
