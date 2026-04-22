// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                      PARTICLE SPARKLE SYSTEM v4.0                          ║
// ║   Surface sparkles for metal wire and socket themes                        ║
// ║   Fixed: socket detection, size, early exit for non-metal themes           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG, METAL_THEMES } from '../config.js';
import { logInfo, logPerf, startTimer, endTimer } from '../debug.js';

// Sparkle system state
let sparklePoints = null;
let sparkleGeometry = null;
let sparkleMaterial = null;
let scene = null;
let isInitialized = false;

// Pre-allocated arrays
const MAX_PARTICLES = 2000;
let positions = null;
let colors = null;
let lifetimes = null;
let phases = null;
let particleSource = null;
let particleVertexIndex = null;

// Cached references
let wireRef = null;
let activeLightsRef = null;
let lastWireRef = null;

// Temp vectors
const _sparkleVec = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _lightPos = new THREE.Vector3();

/**
 * Check if any metal theme is active
 */
function hasMetalTheme() {
    const wireIsMetal = METAL_THEMES.WIRE.includes(CONFIG.WIRE_THEME);
    const socketIsMetal = CONFIG.SOCKET_THEME === 'WIRE_MATCH'
        ? wireIsMetal
        : METAL_THEMES.SOCKET.includes(CONFIG.SOCKET_THEME);
    return wireIsMetal || socketIsMetal;
}

/**
 * Initialize sparkle system - SKIPS if no metal themes
 */
export function initSparkleSystem(sceneRef, wire, activeLights) {
    disposeSparkleSystem();

    scene = sceneRef;
    wireRef = wire;
    activeLightsRef = activeLights;
    lastWireRef = wire;

    // EARLY EXIT: Skip expensive setup if no metal themes
    if (!hasMetalTheme()) {
        isInitialized = false;
        return;
    }

    // Allocate buffers
    positions = new Float32Array(MAX_PARTICLES * 3);
    colors = new Float32Array(MAX_PARTICLES * 3);
    lifetimes = new Float32Array(MAX_PARTICLES);
    phases = new Float32Array(MAX_PARTICLES);
    particleSource = new Array(MAX_PARTICLES).fill(null);
    particleVertexIndex = new Uint32Array(MAX_PARTICLES);

    // Initialize particles as hidden
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const i3 = i * 3;
        positions[i3] = 0;
        positions[i3 + 1] = -1000;
        positions[i3 + 2] = 0;
        lifetimes[i] = 0;
        phases[i] = Math.random() * Math.PI * 2;
        colors[i3] = 1;
        colors[i3 + 1] = 1;
        colors[i3 + 2] = 1;
    }

    // Create geometry
    sparkleGeometry = new THREE.BufferGeometry();
    sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sparkleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Material with constant pixel size
    sparkleMaterial = new THREE.PointsMaterial({
        size: 0.8,  // Reduced from 3
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: false
    });

    sparklePoints = new THREE.Points(sparkleGeometry, sparkleMaterial);
    sparklePoints.frustumCulled = false;
    scene.add(sparklePoints);

    isInitialized = true;
}

/**
 * Sample wire surface vertex with normal offset
 */
function sampleWireSurface(mesh, targetVec, normalVec) {
    if (!mesh?.geometry?.attributes?.position) return -1;

    const posAttr = mesh.geometry.attributes.position;
    const normalAttr = mesh.geometry.attributes.normal;
    const count = posAttr.count;
    if (count === 0) return -1;

    const idx = Math.floor(Math.random() * count);
    targetVec.fromBufferAttribute(posAttr, idx);

    if (normalAttr) {
        normalVec.fromBufferAttribute(normalAttr, idx);
    } else {
        normalVec.set(0, 1, 0);
    }

    mesh.localToWorld(targetVec);
    normalVec.transformDirection(mesh.matrixWorld);

    // Offset along normal to place ON surface (increased for visibility)
    targetVec.addScaledVector(normalVec, 0.005);

    return idx;
}

/**
 * Read vertex position for per-frame tracking
 */
function readMeshPosition(mesh, vertexIndex, targetVec, normalVec) {
    if (!mesh?.geometry?.attributes?.position) return false;

    const posAttr = mesh.geometry.attributes.position;
    const normalAttr = mesh.geometry.attributes.normal;
    if (vertexIndex >= posAttr.count) return false;

    targetVec.fromBufferAttribute(posAttr, vertexIndex);
    mesh.localToWorld(targetVec);

    if (normalAttr) {
        normalVec.fromBufferAttribute(normalAttr, vertexIndex);
        normalVec.transformDirection(mesh.matrixWorld);
        targetVec.addScaledVector(normalVec, 0.005);
    }

    return true;
}

/**
 * Find socket mesh by checking material metalness (socket has metalness > 0.5)
 */
function findSocketMesh(lightGroup) {
    if (!lightGroup?.children) return null;

    for (const child of lightGroup.children) {
        if (child.isMesh && child.material) {
            // Socket material has metalness: 0.6, glass has metalness: 0
            if (child.material.metalness > 0.5) {
                return child;
            }
        }
    }
    return null;
}

/**
 * Sample socket surface position
 */
function sampleSocketSurface(socketMesh, targetVec, normalVec) {
    if (!socketMesh?.geometry?.attributes?.position) return -1;

    const posAttr = socketMesh.geometry.attributes.position;
    const normalAttr = socketMesh.geometry.attributes.normal;
    const count = posAttr.count;
    if (count === 0) return -1;

    const idx = Math.floor(Math.random() * count);
    targetVec.fromBufferAttribute(posAttr, idx);

    if (normalAttr) {
        normalVec.fromBufferAttribute(normalAttr, idx);
    } else {
        normalVec.set(0, 1, 0);
    }

    socketMesh.localToWorld(targetVec);
    normalVec.transformDirection(socketMesh.matrixWorld);
    targetVec.addScaledVector(normalVec, 0.003);

    return idx;
}

/**
 * Respawn particle on wire or socket surface
 */
function respawnParticle(index) {
    const i3 = index * 3;

    const wireIsMetal = METAL_THEMES.WIRE.includes(CONFIG.WIRE_THEME);
    const socketIsMetal = CONFIG.SOCKET_THEME === 'WIRE_MATCH'
        ? wireIsMetal
        : METAL_THEMES.SOCKET.includes(CONFIG.SOCKET_THEME);

    if (!wireIsMetal && !socketIsMetal) {
        positions[i3 + 1] = -1000;
        lifetimes[index] = 999;
        particleSource[index] = null;
        return;
    }

    const useWire = Math.random() < 0.8;

    if (useWire && wireIsMetal && wireRef?.mesh1) {
        const mesh = Math.random() < 0.5 ? wireRef.mesh1 : wireRef.mesh2;
        const vertexIdx = sampleWireSurface(mesh, _sparkleVec, _normal);

        if (vertexIdx >= 0) {
            positions[i3] = _sparkleVec.x;
            positions[i3 + 1] = _sparkleVec.y;
            positions[i3 + 2] = _sparkleVec.z;

            particleSource[index] = mesh === wireRef.mesh1 ? 'wire1' : 'wire2';
            particleVertexIndex[index] = vertexIdx;

            colors[i3] = 1.0;
            colors[i3 + 1] = 0.95;
            colors[i3 + 2] = 0.9;
        } else {
            positions[i3 + 1] = -1000;
            lifetimes[index] = 0.1;
            return;
        }
    } else if (socketIsMetal && activeLightsRef?.length > 0) {
        const lightIndex = Math.floor(Math.random() * activeLightsRef.length);
        const light = activeLightsRef[lightIndex];
        const socketMesh = findSocketMesh(light);

        if (socketMesh) {
            const vertexIdx = sampleSocketSurface(socketMesh, _sparkleVec, _normal);
            if (vertexIdx >= 0) {
                positions[i3] = _sparkleVec.x;
                positions[i3 + 1] = _sparkleVec.y;
                positions[i3 + 2] = _sparkleVec.z;

                particleSource[index] = 'socket';
                particleVertexIndex[index] = lightIndex;

                colors[i3] = 1.0;
                colors[i3 + 1] = 0.85;
                colors[i3 + 2] = 0.7;
            } else {
                positions[i3 + 1] = -1000;
                lifetimes[index] = 0.1;
                return;
            }
        } else {
            // Hide if socket not found
            positions[i3 + 1] = -1000;
            lifetimes[index] = 0.1;
            return;
        }
    } else {
        positions[i3 + 1] = -1000;
        lifetimes[index] = 0.1;
        particleSource[index] = null;
        return;
    }

    lifetimes[index] = 0.3 + Math.random() * 1.2;
    phases[index] = Math.random() * Math.PI * 2;
}

/**
 * Update sparkle system
 */
export function updateSparkleSystem(time, wire, activeLights) {
    // EARLY EXIT: If not initialized (no metal themes), do nothing
    if (!isInitialized || !sparklePoints) {
        // Check if metal theme was added - reinitialize if needed
        if (hasMetalTheme() && scene) {
            initSparkleSystem(scene, wire, activeLights);
        }
        return;
    }

    wireRef = wire;
    activeLightsRef = activeLights;

    if (wire !== lastWireRef) {
        lastWireRef = wire;
    }

    // Hide if no metal themes
    if (!hasMetalTheme()) {
        sparklePoints.visible = false;
        return;
    }

    const meshReady = wire?.mesh1?.geometry?.attributes?.position;
    if (!meshReady) {
        sparklePoints.visible = false;
        return;
    }

    sparklePoints.visible = true;

    const deltaTime = 0.016;
    const timeS = time * 0.001;

    for (let i = 0; i < MAX_PARTICLES; i++) {
        const i3 = i * 3;

        lifetimes[i] -= deltaTime;
        if (lifetimes[i] <= 0) {
            respawnParticle(i);
            continue;
        }

        const source = particleSource[i];
        const vertIdx = particleVertexIndex[i];

        if (source === 'wire1' && wireRef?.mesh1) {
            readMeshPosition(wireRef.mesh1, vertIdx, _sparkleVec, _normal);
            positions[i3] = _sparkleVec.x;
            positions[i3 + 1] = _sparkleVec.y;
            positions[i3 + 2] = _sparkleVec.z;
        } else if (source === 'wire2' && wireRef?.mesh2) {
            readMeshPosition(wireRef.mesh2, vertIdx, _sparkleVec, _normal);
            positions[i3] = _sparkleVec.x;
            positions[i3 + 1] = _sparkleVec.y;
            positions[i3 + 2] = _sparkleVec.z;
        } else if (source === 'socket' && activeLightsRef?.[vertIdx]) {
            // Update socket position from light's current world position (follows sway)
            const light = activeLightsRef[vertIdx];
            const socketMesh = findSocketMesh(light);
            if (socketMesh) {
                // Get world position of light group then offset for socket
                light.getWorldPosition(_sparkleVec);
                positions[i3] = _sparkleVec.x;
                positions[i3 + 1] = _sparkleVec.y - 0.1;  // Socket offset
                positions[i3 + 2] = _sparkleVec.z;
            }
        }

        // Twinkle
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(timeS * 15 + phases[i]));

        // Fade
        let alpha = 1.0;
        if (lifetimes[i] < 0.15) {
            alpha = lifetimes[i] / 0.15;
        } else if (lifetimes[i] > 1.0) {
            alpha = Math.min(1, (1.5 - lifetimes[i]) / 0.5);
        }

        const brightness = twinkle * alpha;

        // Point light boost (simplified)
        let lightBoost = 0;
        if (CONFIG.POINT_LIGHTS_ENABLED && activeLightsRef?.length > 0) {
            const checkCount = Math.min(3, activeLightsRef.length);
            for (let j = 0; j < checkCount; j++) {
                const idx = Math.floor(Math.random() * activeLightsRef.length);
                const light = activeLightsRef[idx];
                if (!light.userData?.pointLight) continue;

                light.getWorldPosition(_lightPos);
                const dx = positions[i3] - _lightPos.x;
                const dy = positions[i3 + 1] - _lightPos.y;
                const dz = positions[i3 + 2] - _lightPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq < 4.0) {
                    lightBoost = Math.max(lightBoost, 1 - Math.sqrt(distSq) / 2.0);
                }
            }
        }

        const finalBright = Math.min(1.5, brightness + lightBoost * 0.5);
        colors[i3] = finalBright;
        colors[i3 + 1] = finalBright * 0.9;
        colors[i3 + 2] = finalBright * 0.8;
    }

    sparkleGeometry.attributes.position.needsUpdate = true;
    sparkleGeometry.attributes.color.needsUpdate = true;
}

/**
 * Dispose resources
 */
export function disposeSparkleSystem() {
    if (sparklePoints && scene) {
        scene.remove(sparklePoints);
    }

    if (sparkleGeometry) {
        sparkleGeometry.dispose();
        sparkleGeometry = null;
    }

    if (sparkleMaterial) {
        sparkleMaterial.dispose();
        sparkleMaterial = null;
    }

    sparklePoints = null;
    scene = null;
    wireRef = null;
    activeLightsRef = null;
    lastWireRef = null;
    isInitialized = false;

    positions = null;
    colors = null;
    lifetimes = null;
    phases = null;
    particleSource = null;
    particleVertexIndex = null;
}
