// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    SECTION 7: INITIALIZATION                              ║
// ║                Main entry point - window load, camera init                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { loadConfig, CONFIG, REFERENCE_RESOLUTION, updateCameraBase, applyFinalPosition } from './config.js';
import { setupUI } from './ui.js';
import { initScene } from './renderer.js';
import { camera, renderer, activeScene } from './renderer.js';

// Initialize everything on page load (guard against multiple listeners)
if (!window.loadListenerAdded) {
    window.loadListenerAdded = true;
    window.addEventListener('load', () => {
        console.log('🎄 Window load event fired');

        // Add global click debug logger for OBS troubleshooting
        document.addEventListener('click', (e) => {
            console.log('🖱️ Click detected:', {
                target: e.target.tagName,
                id: e.target.id,
                class: e.target.className,
                x: e.clientX,
                y: e.clientY
            });
        }, true); // Use capture phase

        // Add mutation observer to detect DOM changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Element node
                            if (node.classList && (node.classList.contains('preset-bar') ||
                                node.classList.contains('panel-header') ||
                                node.classList.contains('master-controls'))) {
                                console.error('🚨 DUPLICATION DETECTED:', node.className);
                                console.trace('Stack trace:');
                            }
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        loadConfig(); // Load saved settings
        setupUI();
        initScene();

        // Initialize camera system with default values
        window.lastLoadedCameraData = {
            distance: CONFIG.CAMERA_DISTANCE || 14,
            height: CONFIG.CAMERA_HEIGHT || 0,
            pan: CONFIG.CAMERA_X || 0,
            refAspect: REFERENCE_RESOLUTION.aspect,
            refVisibleHeight: 2 * Math.tan((40 * Math.PI / 180) / 2) * (CONFIG.CAMERA_DISTANCE || 14),
            refVisibleWidth: 2 * Math.tan((40 * Math.PI / 180) / 2) * (CONFIG.CAMERA_DISTANCE || 14) * REFERENCE_RESOLUTION.aspect
        };
        updateCameraBase();
        applyFinalPosition(camera, renderer, activeScene);

        console.log('✅ Initialization complete');
        console.log('👀 Mutation observer active - watching for DOM changes');

        // Window resize handler for base+offset system
        window.addEventListener('resize', () => {
            if (typeof renderer !== 'undefined' && renderer) {
                renderer.setSize(window.innerWidth, window.innerHeight);
            }
            if (typeof camera !== 'undefined' && camera) {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();

                // Recalculate base, preserve user offset
                if (window.lastLoadedCameraData) {
                    updateCameraBase();   // Recalc base only
                    applyFinalPosition(camera, renderer, activeScene); // Apply base + offset
                }
            }
        });
    });
} else {
    console.error('❌ Load listener already added!');
}
