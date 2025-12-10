// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                    SECTION 4: GEOMETRY CLASSES                            ║
// ║          TwistedCurve, Wire, createBulbInstance, snow/stars               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { CONFIG } from './config.js';
import { getBulbPalette, HelixCurve, showToast } from './utils.js';

// NOTE: We have to be careful here - geometry.js is imported BY renderer.js
// So we can't import activePoints/originalBasePoints from renderer (circular dependency)
// Instead, we'll just reference them globally when needed

// =========================================
//  UPDATED WIRE LOGIC (The U-Shape "Staple" Fix)
// =========================================

export class TwistedCurve extends THREE.Curve {
    constructor(baseCurve, offset, turns, phase, connects = [], bypasses = [], bulbScale = 0.1) {
        super();
        this.baseCurve = baseCurve;
        this.offset = offset;
        this.turns = turns;
        this.phase = phase;
        this.connects = connects;
        this.bypasses = bypasses;
        this.bulbScale = bulbScale;

        // --- TUNING THE U-SHAPE ---
        this.pinchRange = 0.005 + (this.bulbScale * 0.03);

        // DYNAMIC DEPTH: 
        // Base depth (1.6 * scale) + The Wire Radius (this.offset)
        // This ensures the wire always reaches the socket, even if wires are wide.
        this.dipDepth = (1.5 * this.bulbScale) + this.offset;

        this.cornerSharpness = 8;
        this.socketRadius = 0.002;
        // Match bypass to offset so it stays perfectly aligned with the main spiral
        this.bypassRadius = this.offset;
    }

    getPoint(t, optionalTarget = new THREE.Vector3()) {
        const basePoint = this.baseCurve.getPoint(t);
        const tangent = this.baseCurve.getTangent(t).normalize();

        let normal = new THREE.Vector3(0, 1, 0);
        if (Math.abs(tangent.y) > 0.99) normal.set(1, 0, 0);
        const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
        normal.crossVectors(binormal, tangent).normalize();

        // --- INTERACTION LOGIC ---
        let influence = 0;
        let type = 'none';

        for (let i = 0; i < this.connects.length; i++) {
            const dist = Math.abs(t - this.connects[i]);
            if (dist < this.pinchRange) {
                const x = 1.0 - (dist / this.pinchRange);
                influence = Math.pow(x, this.cornerSharpness);
                type = 'connect';
                break;
            }
        }

        if (type === 'none') {
            for (let i = 0; i < this.bypasses.length; i++) {
                const dist = Math.abs(t - this.bypasses[i]);
                if (dist < this.pinchRange) {
                    const x = 1.0 - (dist / this.pinchRange);
                    influence = x * x * (3 - 2 * x);
                    type = 'bypass';
                    break;
                }
            }
        }

        // --- TWIST CALCULATION ---
        const twistAngle = (t * this.turns * Math.PI * 2) + this.phase;
        let cx = Math.cos(twistAngle);
        let cy = Math.sin(twistAngle);

        // --- APPLY SHAPE ---
        let rad = this.offset;
        let vertOffset = 0;

        if (influence > 0) {
            if (type === 'connect') {
                // 1. Freeze Rotation
                const targetCos = Math.cos(this.phase);
                const targetSin = Math.sin(this.phase);
                cx = (cx * (1 - influence)) + (targetCos * influence);
                cy = (cy * (1 - influence)) + (targetSin * influence);

                // 2. Shrink Radius
                rad = (this.offset * (1 - influence)) + (this.socketRadius * influence);

                // 3. DROP DOWN (The Tight U-Shape)
                vertOffset = -this.dipDepth * influence;
            }
            else if (type === 'bypass') {
                rad = (this.offset * (1 - influence)) + (this.bypassRadius * influence);
            }

            const len = Math.sqrt(cx * cx + cy * cy);
            if (len > 0.001) { cx /= len; cy /= len; }
        }

        const offsetDir = normal.clone().multiplyScalar(cx).add(binormal.clone().multiplyScalar(cy));
        const finalPos = basePoint.clone().addScaledVector(offsetDir, rad);

        // Apply the Vertical Dip
        finalPos.addScaledVector(normal, vertOffset);

        return optionalTarget.copy(finalPos);
    }
}

export class Wire {
    constructor(curve, color1, color2, thickness, offset, turns, scene) {
        this.sourceCurve = curve;
        this.thickness = thickness;
        this.offset = offset;
        this.turns = turns;
        this.scene = scene;
        this.group = new THREE.Group();

        this.material1 = new THREE.MeshStandardMaterial({ color: color1, roughness: 0.6, metalness: 0.1 });
        this.material2 = new THREE.MeshStandardMaterial({ color: color2, roughness: 0.6, metalness: 0.1 });

        this.mesh1 = new THREE.Mesh(new THREE.BufferGeometry(), this.material1);
        this.mesh2 = new THREE.Mesh(new THREE.BufferGeometry(), this.material2);

        this.group.add(this.mesh1);
        this.group.add(this.mesh2);
        scene.add(this.group);

        this.allBulbs = [];

        // Cache System
        this.cache = [];
        this.isBaking = false;
    }

    setAttachmentPoints(lights) {
        this.allBulbs = lights.map(l => l.userData.tLocation);
    }

    calculatePointsForPhase(phase, activePoints, originalBasePoints, swayAmount) {
        const swayX = (swayAmount !== undefined) ? (swayAmount * 0.2) : CONFIG.SWAY_X;
        const swayZ = (swayAmount !== undefined) ? swayAmount : CONFIG.SWAY_Z;

        activePoints.forEach((p, i) => {
            const segmentSize = 13;
            const isPinPoint = (i % segmentSize === 0);

            if (!isPinPoint) {
                const tPhase = phase + i;
                p.z = originalBasePoints[i].z + Math.sin(tPhase) * swayZ;
                p.x = originalBasePoints[i].x + Math.cos(tPhase * 1.0) * swayX;
            } else {
                p.copy(originalBasePoints[i]);
            }
        });
        this.sourceCurve.updateArcLengths();
    }

    startBaking() {
        if (this.isBaking || (CONFIG.SWAY_X <= 0.001 && CONFIG.SWAY_Z <= 0.001)) return;

        console.log('Action: Started Background Baking...');
        showToast('Optimizing Animation Cache...', 'info', 4000);
        this.isBaking = true;
        this.cache = [];
        this.bakedSwayX = CONFIG.SWAY_X;
        this.bakedSwayZ = CONFIG.SWAY_Z;
        this.bakeIndex = 0;
        this.bakeResolution = 600;
    }

    processBakingStep(activePoints, originalBasePoints) {
        if (!this.isBaking) return true;

        const phase = (this.bakeIndex / this.bakeResolution) * Math.PI * 2;
        const backups = activePoints.map(p => p.clone());

        this.calculatePointsForPhase(phase, activePoints, originalBasePoints, this.bakedSwayZ);
        this.updateGeometry();

        this.cache.push({
            pos1: new Float32Array(this.mesh1.geometry.attributes.position.array),
            pos2: new Float32Array(this.mesh2.geometry.attributes.position.array)
        });

        activePoints.forEach((p, i) => p.copy(backups[i]));
        this.sourceCurve.updateArcLengths();

        this.bakeIndex++;

        if (this.bakeIndex >= this.bakeResolution) {
            this.isBaking = false;
            console.log(`Cache Baked: ${this.cache.length} frames at SwayZ=${this.bakedSwayZ}, SwayX=${this.bakedSwayX}`);
            return true;
        }

        return false;
    }

    clearCache() {
        if (this.cache && this.cache.length > 0) {
            this.cache = [];
            this.bakedSway = 0;
            console.log('Cache Cleared');
        }
    }

    updateFromCache(totalPhase) {
        if (Math.abs(CONFIG.SWAY_X - (this.bakedSwayX || 0)) > 0.001 ||
            Math.abs(CONFIG.SWAY_Z - (this.bakedSwayZ || 0)) > 0.001) {
            this.clearCache();
            return false;
        }

        if (!this.cache || this.cache.length === 0) return false;

        const cycle = Math.PI * 2;
        const normalized = (totalPhase % cycle + cycle) % cycle;
        const index = Math.floor((normalized / cycle) * this.cache.length) % this.cache.length;

        const frame = this.cache[index];

        this.mesh1.geometry.attributes.position.array.set(frame.pos1);
        this.mesh1.geometry.attributes.position.needsUpdate = true;

        this.mesh2.geometry.attributes.position.array.set(frame.pos2);
        this.mesh2.geometry.attributes.position.needsUpdate = true;

        return true;
    }

    updateGeometry() {
        const qualityMap = { low: 150, medium: 750, high: 1400, ultra: 2000 };
        let segments = qualityMap[CONFIG.QUALITY] || 1400;

        const twistMultiplier = Math.max(1, CONFIG.WIRE_TWISTS / 40);
        segments = Math.floor(segments * twistMultiplier);

        const evens = this.allBulbs.filter((_, i) => i % 2 === 0);
        const odds = this.allBulbs.filter((_, i) => i % 2 !== 0);

        const curve1 = new TwistedCurve(this.sourceCurve, this.offset, this.turns, 0, evens, odds, CONFIG.BULB_SCALE);
        const curve2 = new TwistedCurve(this.sourceCurve, this.offset, this.turns, Math.PI, odds, evens, CONFIG.BULB_SCALE);

        this.curve1 = curve1;
        this.curve2 = curve2;

        this.mesh1.geometry.dispose();
        this.mesh1.geometry = new THREE.TubeGeometry(curve1, segments, this.thickness, 6, false);

        this.mesh2.geometry.dispose();
        this.mesh2.geometry = new THREE.TubeGeometry(curve2, segments, this.thickness, 6, false);
    }
}

export function createBulbInstance(colorHex, themePalette, activeWireColorA) {
    const lightGroup = new THREE.Group();
    const palette = getBulbPalette(colorHex);

    const yOffset = -0.55;
    const qualityMap = { low: 32, medium: 108, high: 180, ultra: 256 };
    const tubeSegments = qualityMap[CONFIG.QUALITY] || 180;

    // Filament
    const filGeo = new THREE.TubeGeometry(new HelixCurve(), tubeSegments, 0.03, 8, false);
    const filMat = new THREE.MeshBasicMaterial({ color: palette.filament });
    const filament = new THREE.Mesh(filGeo, filMat);
    filament.position.y = yOffset;
    lightGroup.add(filament);

    // Glass
    const glassQuality = { low: 16, medium: 48, high: 88, ultra: 128 };
    const glassSegments = glassQuality[CONFIG.QUALITY] || 88;
    const pts = [new THREE.Vector2(0.22, 0.0), new THREE.Vector2(0.45, 0.4), new THREE.Vector2(0.55, 0.9), new THREE.Vector2(0.40, 1.8), new THREE.Vector2(0.0, 2.6)];
    const shape = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(glassSegments), glassSegments);

    const transmissionAmount = Math.max(0, 1 - (CONFIG.GLASS_ROUGHNESS * 0.8));

    const glassMat = new THREE.MeshPhysicalMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: CONFIG.EMISSIVE_INTENSITY,
        metalness: 0.0,
        roughness: CONFIG.GLASS_ROUGHNESS,
        transmission: transmissionAmount,
        ior: CONFIG.GLASS_IOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: CONFIG.GLASS_OPACITY,
        depthWrite: true,
        clearcoat: 0.3,
        clearcoatRoughness: CONFIG.GLASS_ROUGHNESS * 0.5
    });

    glassMat.userData.isBulbMaterial = true;
    const bulb = new THREE.Mesh(shape, glassMat);
    bulb.position.y = yOffset;
    bulb.castShadow = true;
    bulb.receiveShadow = true;
    lightGroup.add(bulb);

    // Socket
    const socketQuality = { low: 8, medium: 24, high: 44, ultra: 64 };
    const socketSegments = socketQuality[CONFIG.QUALITY] || 44;
    const sPts = [new THREE.Vector2(0.45, 0.5), new THREE.Vector2(0.47, 0.5), new THREE.Vector2(0.46, 0.3), new THREE.Vector2(0.42, 0.0), new THREE.Vector2(0.25, -0.4), new THREE.Vector2(0.15, -0.6), new THREE.Vector2(0, -0.65)];
    const sShape = new THREE.LatheGeometry(new THREE.SplineCurve(sPts).getPoints(socketSegments), socketSegments);
    const sMat = new THREE.MeshStandardMaterial({
        color: activeWireColorA,
        roughness: 0.5,
        metalness: 0.2,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true
    });
    const socket = new THREE.Mesh(sShape, sMat);

    socket.position.y = -0.1 + yOffset;
    socket.castShadow = true;
    socket.receiveShadow = true;
    lightGroup.add(socket);

    lightGroup.userData = {
        glass: glassMat,
        filament: filMat,
        baseFilament: palette.filament.clone(),
        baseEmissive: CONFIG.EMISSIVE_INTENSITY,
        themePalette: themePalette,
        paletteIndex: themePalette.indexOf(colorHex),
        currentIntensity: 1.0,
        targetIntensity: 1.0,
        state: 'HOLD',
        timer: Math.random() * 1.0,
        step: 0
    };

    lightGroup.scale.setScalar(CONFIG.BULB_SCALE);
    return lightGroup;
}

// =========================================
//  STARS AND SNOW SYSTEMS
// =========================================
export function createStars(scene) {
    const starCount = 500;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 100 - 30;
        sizes[i] = Math.random() * 2 + 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.1,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });

    const starField = new THREE.Points(geometry, material);
    scene.add(starField);
    return starField;
}

export function createSnowParticles(scene) {
    const snowCount = CONFIG.SNOW_COUNT;

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
        velocities[i] = CONFIG.SNOW_SPEED * (0.3 + depth * 0.7);
        drifts[i] = CONFIG.SNOW_DRIFT * (0.5 + Math.random() * 0.5);
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

    return { points, geometry };
}

export function updateSnow(snowData, time) {
    if (!snowData || !snowData.geometry) return;

    const positions = snowData.geometry.attributes.position.array;
    const velocities = snowData.geometry.attributes.velocity.array;
    const drifts = snowData.geometry.attributes.drift.array;
    const wobbles = snowData.geometry.attributes.wobble.array;
    const wobbleSpeeds = snowData.geometry.attributes.wobbleSpeed.array;

    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        positions[i3 + 1] -= velocities[i];

        wobbles[i] += wobbleSpeeds[i] * 0.01;
        positions[i3] += Math.sin(wobbles[i]) * drifts[i];
        positions[i3] += Math.sin(time * 0.0005) * drifts[i] * 0.5;

        if (positions[i3 + 1] < -5) {
            positions[i3 + 1] = 15 + Math.random() * 5;
            positions[i3] = (Math.random() - 0.5) * 40;
            positions[i3 + 2] = (Math.random() - 0.5) * 30;
        }
    }

    snowData.geometry.attributes.position.needsUpdate = true;
    snowData.geometry.attributes.wobble.needsUpdate = true;
}

// =========================================
//  PROCEDURAL CURVE GENERATION
// =========================================
export function generateBasePoints(numPins, sagAmplitude) {
    const points = [];
    const totalWidth = 32;
    const startX = -16;
    const spacing = totalWidth / (numPins - 1);
    const pinHeight = 4.5;

    for (let i = 0; i < numPins; i++) {
        const x = startX + (i * spacing);

        points.push(new THREE.Vector3(x, pinHeight, 0));

        if (i < numPins - 1) {
            const segmentSteps = 12;

            for (let step = 1; step <= segmentSteps; step++) {
                const t = step / (segmentSteps + 1);
                const midX = x + (spacing * t);

                const tensionFactor = 1 - (CONFIG.TENSION * 0.5);
                const dropAmount = 4 * t * (1 - t) * tensionFactor;
                const midY = pinHeight - (sagAmplitude * dropAmount);

                points.push(new THREE.Vector3(midX, midY, 0));
            }
        }
    }
    return points;
}
