// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                           SNOW PARTICLES                                  ║
// ║  Falling snow particle system                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { logInfo, startTimer, endTimer } from '../debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Snow Count Tracking
// ═══════════════════════════════════════════════════════════════════════════════

let _lastSnowCount = null;

export function shouldRecreateSnow() {
    if (_lastSnowCount !== null && _lastSnowCount !== CONFIG.SNOW_COUNT) {
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  createSnowParticles
// ═══════════════════════════════════════════════════════════════════════════════

export function createSnowParticles(scene) {
    logInfo('Snow', 'createSnowParticles() called');
    startTimer('create-snow-internal');
    const snowCount = CONFIG.SNOW_COUNT;
    _lastSnowCount = snowCount; // Track for reactive updates

    const createSnowTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.6, 'rgba(200, 220, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(200, 220, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        return new THREE.CanvasTexture(canvas);
    };

    const snowTexture = createSnowTexture();

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(snowCount * 3);
    const sizes = new Float32Array(snowCount);
    const velocities = new Float32Array(snowCount);
    const depths = new Float32Array(snowCount);
    const drifts = new Float32Array(snowCount);
    const wobbles = new Float32Array(snowCount);
    const wobbleSpeeds = new Float32Array(snowCount);

    for (let i = 0; i < snowCount; i++) {
        const i3 = i * 3;

        positions[i3] = (Math.random() - 0.5) * 40;
        positions[i3 + 1] = Math.random() * 20 + 5;
        positions[i3 + 2] = (Math.random() - 0.5) * 30;

        const depth = Math.random();
        depths[i] = depth;
        sizes[i] = CONFIG.SNOW_SIZE * (0.5 + Math.random() * 2);
        // Store normalized base velocity (random variation only) - CONFIG applied in updateSnow
        velocities[i] = 0.3 + depth * 0.7;
        // Store normalized base drift (random variation only) - CONFIG applied in updateSnow
        drifts[i] = 0.5 + Math.random() * 0.5;
        wobbles[i] = Math.random() * Math.PI * 2;
        wobbleSpeeds[i] = 0.5 + Math.random() * 1.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    geometry.setAttribute('depth', new THREE.BufferAttribute(depths, 1));
    geometry.setAttribute('drift', new THREE.BufferAttribute(drifts, 1));
    geometry.setAttribute('wobble', new THREE.BufferAttribute(wobbles, 1));
    geometry.setAttribute('wobbleSpeed', new THREE.BufferAttribute(wobbleSpeeds, 1));

    const material = new THREE.PointsMaterial({
        size: CONFIG.SNOW_SIZE * 2,
        map: snowTexture,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    return { points, geometry, material };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  updateSnow
// ═══════════════════════════════════════════════════════════════════════════════

export function updateSnow(snowData, time) {
    if (!snowData || !snowData.geometry) return;

    // Live size update
    if (snowData.material) {
        snowData.material.size = CONFIG.SNOW_SIZE * 2;
    }

    const positions = snowData.geometry.attributes.position.array;
    const velocities = snowData.geometry.attributes.velocity.array;
    const depths = snowData.geometry.attributes.depth.array;
    const drifts = snowData.geometry.attributes.drift.array;
    const wobbles = snowData.geometry.attributes.wobble.array;
    const wobbleSpeeds = snowData.geometry.attributes.wobbleSpeed.array;

    const count = positions.length / 3;

    // Live CONFIG values applied directly to normalized base values
    const snowSpeed = CONFIG.SNOW_SPEED;
    const snowDrift = CONFIG.SNOW_DRIFT;

    // Calculate visible vertical range based on camera
    // FOV is 40 degrees, so half-angle is 20 degrees
    const cameraDistance = CONFIG.CAMERA_DISTANCE || 14;
    const fovRadians = (40 * Math.PI) / 180;
    const halfHeight = Math.tan(fovRadians / 2) * cameraDistance;
    const cameraY = CONFIG.CAMERA_HEIGHT || 0;

    // Snow should reset below the visible bottom with some buffer
    const bottomY = cameraY - halfHeight - 5;
    // Snow should spawn above the visible top
    const topY = cameraY + halfHeight + 10;
    const spawnRange = 5;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Per-particle variation for less uniform movement
        const particleVariation = depths[i];

        // Speed variance: base speed modified by particle variation and time-based flutter
        const speedVariance = 0.6 + particleVariation * 0.8 + Math.sin(time * 0.001 + i * 0.1) * 0.15;

        // Occasional upward motion (updrafts) - some particles float up briefly
        const updraftPhase = Math.sin(time * 0.0003 + particleVariation * 10);
        const isUpdraft = updraftPhase > 0.85; // ~15% chance per cycle
        const verticalMotion = isUpdraft ? -0.3 : 1.0; // negative = upward

        // Apply speed with variance and occasional updrafts
        positions[i3 + 1] -= velocities[i] * snowSpeed * speedVariance * verticalMotion;

        // Wobble animation
        wobbles[i] += wobbleSpeeds[i] * 0.01 * (0.7 + particleVariation * 0.6);
        const effectiveDrift = drifts[i] * snowDrift;

        // Loopy-loo motion: circular swirling path (more pronounced for some particles)
        const loopIntensity = particleVariation > 0.7 ? 2.0 : 1.0; // deeper particles loop more
        const loopPhase = wobbles[i] * 1.5 + time * 0.0002;
        const loopX = Math.sin(loopPhase) * effectiveDrift * loopIntensity * 0.4;
        const loopZ = Math.cos(loopPhase) * effectiveDrift * loopIntensity * 0.4;

        // X-axis drift with loopy motion
        positions[i3] += Math.sin(wobbles[i]) * effectiveDrift * (0.8 + particleVariation * 0.4);
        positions[i3] += Math.sin(time * 0.0005 + particleVariation * 3) * effectiveDrift * 0.5;
        positions[i3] += loopX;

        // Z-axis drift for depth (increased by 50%, with per-particle variation + loopy motion)
        positions[i3 + 2] += Math.cos(wobbles[i] * 0.7) * effectiveDrift * 0.9 * (0.6 + particleVariation * 0.8);
        positions[i3 + 2] += Math.cos(time * 0.0003 + particleVariation * 2) * effectiveDrift * 0.45;
        positions[i3 + 2] += loopZ;

        // Dynamic reset based on camera visible area
        if (positions[i3 + 1] < bottomY) {
            positions[i3 + 1] = topY + Math.random() * spawnRange;
            positions[i3] = (Math.random() - 0.5) * 40;
            positions[i3 + 2] = (Math.random() - 0.5) * 30;
        }
    }

    snowData.geometry.attributes.position.needsUpdate = true;
    snowData.geometry.attributes.wobble.needsUpdate = true;
}
