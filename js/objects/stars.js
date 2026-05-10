// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                            STARS SYSTEM                                   ║
// ║  Twinkling star field with shooting stars                                 ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { logInfo, startTimer, endTimer } from '../debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Star Shaders
// ═══════════════════════════════════════════════════════════════════════════════

const starVertexShader = `
    attribute float phase;
    attribute float speed;
    attribute float baseOpacity;
    attribute float starSize;
    uniform float time;
    uniform float twinkleIntensity;
    uniform float globalSize;
    varying float vOpacity;
    
    void main() {
        // Calculate twinkle - dramatic oscillation
        float twinkle = sin(time * speed + phase);
        twinkle = twinkle * twinkle; // Make it more "blinky"
        vOpacity = baseOpacity * (0.2 + twinkle * 0.8 * twinkleIntensity);
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = starSize * globalSize * (150.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const starFragmentShader = `
    uniform float globalOpacity;
    varying float vOpacity;
    
    void main() {
        // Create sharp 4-point star shape
        vec2 uv = gl_PointCoord - 0.5;
        float dist = length(uv);
        
        // Sharp center
        float core = 1.0 - smoothstep(0.0, 0.15, dist);
        
        // Subtle glow
        float glow = 1.0 - smoothstep(0.0, 0.5, dist);
        glow *= 0.3;
        
        float alpha = (core + glow) * vOpacity * globalOpacity;
        
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    }
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  Star Count Tracking
// ═══════════════════════════════════════════════════════════════════════════════

let _lastStarCount = null;

export function shouldRecreateStars() {
    if (_lastStarCount !== null && _lastStarCount !== CONFIG.STARS_COUNT) {
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  createStars
// ═══════════════════════════════════════════════════════════════════════════════

export function createStars(scene) {
    logInfo('Stars', 'createStars() called');
    startTimer('create-stars-internal');
    const starCount = CONFIG.STARS_COUNT || 300;
    _lastStarCount = starCount; // Track for reactive updates
    const positions = new Float32Array(starCount * 3);
    const phases = new Float32Array(starCount);
    const speeds = new Float32Array(starCount);
    const baseOpacities = new Float32Array(starCount);
    const starSizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        // Stars spread across the sky - behind and above
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = Math.random() * 30 + 10; // Upper region
        positions[i * 3 + 2] = -30 - Math.random() * 40; // Behind scene

        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 1.0 + Math.random() * 4; // Varying twinkle speeds
        baseOpacities[i] = 0.5 + Math.random() * 0.5; // Base brightness
        starSizes[i] = 0.8 + Math.random() * 0.4; // Relative size variation
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('baseOpacity', new THREE.BufferAttribute(baseOpacities, 1));
    geometry.setAttribute('starSize', new THREE.BufferAttribute(starSizes, 1));

    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            twinkleIntensity: { value: 1.0 },
            globalSize: { value: CONFIG.STARS_SIZE || 1.0 },
            globalOpacity: { value: CONFIG.STARS_OPACITY || 1.0 }
        },
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const starField = new THREE.Points(geometry, material);
    scene.add(starField);

    // Shooting star system
    const shootingStar = createShootingStar(scene);

    return {
        points: starField,
        geometry,
        material,
        shootingStar,
        lastShootingStarTime: 0,
        nextShootingStarDelay: 5000 + Math.random() * 10000
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Shooting Star
// ═══════════════════════════════════════════════════════════════════════════════

function createShootingStar(scene) {
    // Create line geometry for shooting star trail
    const trailLength = 20;
    const positions = new Float32Array(trailLength * 3);
    const opacities = new Float32Array(trailLength);

    for (let i = 0; i < trailLength; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = -50;
        opacities[i] = 1 - (i / trailLength); // Fade tail
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

    const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });

    const line = new THREE.Line(geometry, material);
    scene.add(line);

    return {
        line,
        geometry,
        material,
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        progress: 0,
        speed: 0
    };
}

function triggerShootingStar(shootingStar) {
    // Random start position in upper sky
    const startX = (Math.random() - 0.5) * 80;
    const startY = 25 + Math.random() * 20;
    const startZ = -35 - Math.random() * 20;

    // Direction: slight downward diagonal
    const angle = Math.PI * 0.2 + Math.random() * Math.PI * 0.2;
    const length = 15 + Math.random() * 25;

    shootingStar.startPos.set(startX, startY, startZ);
    shootingStar.endPos.set(
        startX + Math.cos(angle) * length * (Math.random() > 0.5 ? 1 : -1),
        startY - Math.sin(angle) * length * 0.5,
        startZ
    );

    shootingStar.progress = 0;
    shootingStar.speed = 0.015 + Math.random() * 0.02;
    shootingStar.active = true;
    shootingStar.material.opacity = 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  updateStars
// ═══════════════════════════════════════════════════════════════════════════════

export function updateStars(starData, time) {
    if (!starData || !starData.geometry) return;

    const twinkleSpeed = CONFIG.STARS_TWINKLE_SPEED || 0.5;

    // Update shader uniforms
    if (starData.material.uniforms) {
        starData.material.uniforms.time.value = time * 0.001 * twinkleSpeed;
        starData.material.uniforms.twinkleIntensity.value = twinkleSpeed > 0 ? 1.0 : 0.0;
        starData.material.uniforms.globalSize.value = CONFIG.STARS_SIZE || 1.0;
        starData.material.uniforms.globalOpacity.value = CONFIG.STARS_OPACITY || 1.0;
    }

    // Update shooting star
    if (starData.shootingStar) {
        const ss = starData.shootingStar;

        // Check if we should trigger a new shooting star
        if (!ss.active && twinkleSpeed > 0) {
            if (time - starData.lastShootingStarTime > starData.nextShootingStarDelay) {
                triggerShootingStar(ss);
                starData.lastShootingStarTime = time;
                starData.nextShootingStarDelay = 8000 + Math.random() * 15000;
            }
        }

        // Animate active shooting star
        if (ss.active) {
            ss.progress += ss.speed;

            if (ss.progress >= 1) {
                ss.active = false;
                ss.material.opacity = 0;
            } else {
                // Update trail positions
                const positions = ss.geometry.attributes.position.array;
                const trailLength = positions.length / 3;

                for (let i = 0; i < trailLength; i++) {
                    const t = ss.progress - (i * 0.015);
                    if (t < 0 || t > 1) {
                        positions[i * 3] = ss.startPos.x;
                        positions[i * 3 + 1] = ss.startPos.y;
                        positions[i * 3 + 2] = ss.startPos.z;
                    } else {
                        positions[i * 3] = ss.startPos.x + (ss.endPos.x - ss.startPos.x) * t;
                        positions[i * 3 + 1] = ss.startPos.y + (ss.endPos.y - ss.startPos.y) * t;
                        positions[i * 3 + 2] = ss.startPos.z;
                    }
                }

                ss.geometry.attributes.position.needsUpdate = true;

                // Fade in/out
                if (ss.progress < 0.1) {
                    ss.material.opacity = ss.progress * 10;
                } else if (ss.progress > 0.7) {
                    ss.material.opacity = (1 - ss.progress) * 3.33;
                } else {
                    ss.material.opacity = 1;
                }
            }
        }
    }
}
