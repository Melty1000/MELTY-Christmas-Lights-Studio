// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                          GEOMETRY - BARREL FILE                          ║
// ╠═══════════════════════════════════════════════════════════════════════════╣
// ║  Re-exports from objects/ for backwards compatibility                    ║
// ║  Import chain: renderer.js → geometry.js → objects/*                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { logInfo } from './debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Re-exports from objects/
// ═══════════════════════════════════════════════════════════════════════════════

// Wire classes
export { TwistedCurve, Wire } from './objects/wire.js';

// Bulb creation
export { createBulbInstance } from './objects/bulb.js';

// Stars system
export { createStars, updateStars, shouldRecreateStars } from './objects/stars.js';

// Snow system
export { createSnowParticles, updateSnow, shouldRecreateSnow } from './objects/snow.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  generateBasePoints - kept here (only remaining function)
// ═══════════════════════════════════════════════════════════════════════════════

export function generateBasePoints(numPins, sagAmplitude) {
    const points = [];
    const totalWidth = 32;
    const startX = -16;
    const spacing = totalWidth / (numPins - 1);
    const pinHeight = 4.5;
    const tension = CONFIG.TENSION;
    const blendFactor = Math.min(1, tension);

    for (let i = 0; i < numPins; i++) {
        const x = startX + (i * spacing);

        points.push(new THREE.Vector3(x, pinHeight, 0));

        if (i < numPins - 1) {
            const segmentSteps = 12;

            for (let step = 1; step <= segmentSteps; step++) {
                const t = step / (segmentSteps + 1);
                const midX = x + (spacing * t);

                // Parabolic curve: 4*t*(1-t) peaks at 0.5
                const parabola = 4 * t * (1 - t);

                // Catenary-like curve: steeper drop in center
                const centerDist = Math.abs(t - 0.5) * 2;
                const catenary = 1 - Math.pow(centerDist, 0.5 + tension * 0.5);

                // Blend between parabola and catenary
                const dropAmount = parabola * (1 - blendFactor) + catenary * blendFactor;

                const midY = pinHeight - (sagAmplitude * dropAmount);

                points.push(new THREE.Vector3(midX, midY, 0));
            }
        }
    }
    return points;
}
