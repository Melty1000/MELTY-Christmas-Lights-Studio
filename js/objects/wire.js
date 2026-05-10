// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                          WIRE GEOMETRY                                    ║
// ║  TwistedCurve and Wire classes for twisted wire rendering                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { showToast, dismissToast, updateToastProgress } from '../utils.js';
import { logGeom, startTimer, endTimer } from '../debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Reusable Vector3 instances for TwistedCurve.getPoint (avoid per-call GC)
// ═══════════════════════════════════════════════════════════════════════════════

const _curveNormal = new THREE.Vector3();
const _curveBinormal = new THREE.Vector3();
const _offsetDir = new THREE.Vector3();
const _finalPos = new THREE.Vector3();
const _tempVec = new THREE.Vector3();

// ═══════════════════════════════════════════════════════════════════════════════
//  TwistedCurve Class
// ═══════════════════════════════════════════════════════════════════════════════

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
        // Changed: narrower pinch (socket width, not bulb width)
        this.pinchRange = 0.003 + (this.bulbScale * 0.015);

        // Original: Keep wire reaching socket depth
        this.dipDepth = (1.5 * this.bulbScale) + this.offset;

        this.cornerSharpness = 8;
        this.socketRadius = 0.002;
        // Match bypass to offset so it stays perfectly aligned with the main spiral
        this.bypassRadius = this.offset;
    }

    getPoint(t, optionalTarget = new THREE.Vector3()) {
        const basePoint = this.baseCurve.getPoint(t);
        const tangent = this.baseCurve.getTangent(t).normalize();

        // Use reusable vectors instead of allocating new ones
        const normal = _curveNormal.set(0, 1, 0);
        if (Math.abs(tangent.y) > 0.99) normal.set(1, 0, 0);
        const binormal = _curveBinormal.crossVectors(tangent, normal).normalize();
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

        // Compute offset direction using reusable vectors (no clones!)
        // offsetDir = normal * cx + binormal * cy
        _offsetDir.copy(normal).multiplyScalar(cx);
        _tempVec.copy(binormal).multiplyScalar(cy);
        _offsetDir.add(_tempVec);

        // finalPos = basePoint + offsetDir * rad + normal * vertOffset
        _finalPos.copy(basePoint).addScaledVector(_offsetDir, rad);
        _finalPos.addScaledVector(normal, vertOffset);

        return optionalTarget.copy(_finalPos);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Wire Class
// ═══════════════════════════════════════════════════════════════════════════════

export class Wire {
    constructor(curve, color1, color2, thickness, offset, turns, scene) {
        this.sourceCurve = curve;
        this.thickness = thickness;
        this.offset = offset;
        this.turns = turns;
        this.scene = scene;
        this.group = new THREE.Group();

        this.material1 = new THREE.MeshStandardMaterial({ color: color1, roughness: 0.4, metalness: 0.35, envMapIntensity: 0.6 });
        this.material2 = new THREE.MeshStandardMaterial({ color: color2, roughness: 0.4, metalness: 0.35, envMapIntensity: 0.6 });

        // Create meshes with empty BufferGeometry (will be populated by initializeBufferGeometry)
        this.mesh1 = new THREE.Mesh(new THREE.BufferGeometry(), this.material1);
        this.mesh2 = new THREE.Mesh(new THREE.BufferGeometry(), this.material2);

        this.group.add(this.mesh1);
        this.group.add(this.mesh2);
        scene.add(this.group);

        this.allBulbs = [];

        // BufferGeometry tracking
        this.currentSegments = 0;
        this.radialSegments = 8;
        this.geometryInitialized = false;

        // Pre-compute radial sin/cos (same values reused 4000+ times per frame)
        this._radialSin = [];
        this._radialCos = [];
        for (let j = 0; j <= this.radialSegments; j++) {
            const v = j / this.radialSegments * Math.PI * 2;
            this._radialSin.push(Math.sin(v));
            this._radialCos.push(Math.cos(v));
        }

        // Reusable Vector3 instances for computeTubePositions (avoid per-call GC)
        this._tubeP = new THREE.Vector3();
        this._tubeT = new THREE.Vector3();
        this._tubeN = new THREE.Vector3();
        this._tubeB = new THREE.Vector3();
        this._tubeVertex = new THREE.Vector3();

        // Cached arrays for evens/odds (avoid filter() every frame)
        this._evens = [];
        this._odds = [];

        // Persistent TwistedCurve objects (reused every frame)
        this.curve1 = null;
        this.curve2 = null;
    }

    setAttachmentPoints(lights) {
        this.allBulbs = lights.map(l => l.userData.tLocation);
        // Cache evens/odds to avoid filter() every frame
        this._evens = this.allBulbs.filter((_, i) => i % 2 === 0);
        this._odds = this.allBulbs.filter((_, i) => i % 2 !== 0);
        // Invalidate curves so they're rebuilt with new attachment points
        this.curve1 = null;
        this.curve2 = null;
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

    /**
     * Calculate required segment count based on quality and twist settings
     */
    calculateSegmentCount() {
        const qualityMap = { low: 150, medium: 750, high: 1400, ultra: 2000 };
        let segments = qualityMap[CONFIG.QUALITY] || 1400;
        const twistMultiplier = Math.max(1, CONFIG.WIRE_TWISTS / 40);
        // Cap at 4000 to prevent performance collapse at extreme settings
        return Math.min(4000, Math.floor(segments * twistMultiplier));
    }

    /**
     * Initialize persistent BufferGeometry with pre-allocated arrays
     */
    initializeBufferGeometry(segments) {
        const radial = this.radialSegments;
        const vertexCount = (segments + 1) * (radial + 1);
        const indexCount = segments * radial * 6;

        // Build index buffer ONCE (topology is identical for both meshes)
        const indices = new Uint32Array(indexCount);
        let idx = 0;
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < radial; j++) {
                const a = i * (radial + 1) + j;
                const b = (i + 1) * (radial + 1) + j;
                const c = (i + 1) * (radial + 1) + (j + 1);
                const d = i * (radial + 1) + (j + 1);

                indices[idx++] = a;
                indices[idx++] = b;
                indices[idx++] = d;
                indices[idx++] = b;
                indices[idx++] = c;
                indices[idx++] = d;
            }
        }

        // Create geometry for mesh1 - allocate arrays directly (no copying)
        this.mesh1.geometry.dispose();
        this.mesh1.geometry = new THREE.BufferGeometry();
        this.mesh1.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
        this.mesh1.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
        this.mesh1.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
        this.mesh1.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Create geometry for mesh2 - allocate arrays directly (no copying)
        this.mesh2.geometry.dispose();
        this.mesh2.geometry = new THREE.BufferGeometry();
        this.mesh2.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
        this.mesh2.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
        this.mesh2.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
        this.mesh2.geometry.setIndex(new THREE.BufferAttribute(indices, 1)); // Share same index buffer

        this.currentSegments = segments;
        this.geometryInitialized = true;
    }

    /**
     * Compute tube positions and write directly to buffer
     */
    computeTubePositions(geometry, curve, segments) {
        const radial = this.radialSegments;
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const uvs = geometry.attributes.uv.array;

        // Use reusable vectors from class (avoid per-call GC)
        const P = this._tubeP;
        const T = this._tubeT;
        const N = this._tubeN;
        const B = this._tubeB;
        const vertex = this._tubeVertex;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;

            // Get point and tangent from curve
            curve.getPoint(t, P);
            curve.getTangent(t, T).normalize();

            // Compute normal and binormal (Frenet frame approximation)
            if (Math.abs(T.y) > 0.99) {
                N.set(1, 0, 0);
            } else {
                N.set(0, 1, 0);
            }
            B.crossVectors(T, N).normalize();
            N.crossVectors(B, T).normalize();

            // Generate radial vertices (using cached sin/cos)
            for (let j = 0; j <= radial; j++) {
                const sin = this._radialSin[j];
                const cos = this._radialCos[j];

                // Vertex position
                vertex.x = P.x + this.thickness * (cos * N.x + sin * B.x);
                vertex.y = P.y + this.thickness * (cos * N.y + sin * B.y);
                vertex.z = P.z + this.thickness * (cos * N.z + sin * B.z);

                const vertIdx = (i * (radial + 1) + j) * 3;
                positions[vertIdx] = vertex.x;
                positions[vertIdx + 1] = vertex.y;
                positions[vertIdx + 2] = vertex.z;

                // Normal (points outward from tube center)
                normals[vertIdx] = cos * N.x + sin * B.x;
                normals[vertIdx + 1] = cos * N.y + sin * B.y;
                normals[vertIdx + 2] = cos * N.z + sin * B.z;

                // UV
                const uvIdx = (i * (radial + 1) + j) * 2;
                uvs[uvIdx] = t;
                uvs[uvIdx + 1] = j / radial;
            }
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.normal.needsUpdate = true;
        geometry.attributes.uv.needsUpdate = true;
        geometry.computeBoundingSphere();
    }

    updateGeometry() {
        const segments = this.calculateSegmentCount();

        // Check if we need to rebuild buffers (segment count changed)
        if (!this.geometryInitialized || segments !== this.currentSegments) {
            this.initializeBufferGeometry(segments);
        }
        // Use cached evens/odds arrays (set in setAttachmentPoints)
        const evens = this._evens;
        const odds = this._odds;

        // Reuse TwistedCurve objects if they exist, otherwise create them
        if (!this.curve1 || !this.curve2) {
            this.curve1 = new TwistedCurve(this.sourceCurve, this.offset, this.turns, 0, evens, odds, CONFIG.BULB_SCALE);
            this.curve2 = new TwistedCurve(this.sourceCurve, this.offset, this.turns, Math.PI, odds, evens, CONFIG.BULB_SCALE);
        } else {
            // Update existing curves' baseCurve reference (it may have changed due to sway)
            this.curve1.baseCurve = this.sourceCurve;
            this.curve2.baseCurve = this.sourceCurve;
        }

        // Update positions in existing buffers (no allocation!)
        this.computeTubePositions(this.mesh1.geometry, this.curve1, segments);
        this.computeTubePositions(this.mesh2.geometry, this.curve2, segments);
    }

    /**
     * Dispose all GPU resources - MUST be called before creating new Wire
     */
    dispose() {
        // Dispose geometries
        if (this.mesh1.geometry) this.mesh1.geometry.dispose();
        if (this.mesh2.geometry) this.mesh2.geometry.dispose();

        // Dispose materials
        if (this.material1) this.material1.dispose();
        if (this.material2) this.material2.dispose();

        // Remove from scene
        if (this.group && this.scene) {
            this.scene.remove(this.group);
        }

        // Clear curves
        this.curve1 = null;
        this.curve2 = null;
    }

    /**
     * Async geometry update with chunked computation for responsive UI
     * @param {function} onProgress - Callback(progress: 0-100)
     * @param {object} abortSignal - Object with .cancelled property
     * @returns {Promise<void>}
     */
    async updateGeometryAsync(onProgress = null, abortSignal = null) {
        logGeom('updateGeometryAsync() called');
        startTimer('wire-updateGeometryAsync');
        const segments = this.calculateSegmentCount();
        logGeom(`Segments: ${segments}, radial: ${this.radialSegments}`, { quality: CONFIG.QUALITY, twists: CONFIG.WIRE_TWISTS });

        // Check if we need to rebuild buffers
        if (!this.geometryInitialized || segments !== this.currentSegments) {
            logGeom('Initializing buffer geometry (segment count changed)');
            startTimer('wire-initBufferGeometry');
            this.initializeBufferGeometry(segments);
            endTimer('wire-initBufferGeometry');
        }

        const evens = this._evens;
        const odds = this._odds;

        // Create/update curves
        if (!this.curve1 || !this.curve2) {
            logGeom('Creating TwistedCurve objects');
            this.curve1 = new TwistedCurve(this.sourceCurve, this.offset, this.turns, 0, evens, odds, CONFIG.BULB_SCALE);
            this.curve2 = new TwistedCurve(this.sourceCurve, this.offset, this.turns, Math.PI, odds, evens, CONFIG.BULB_SCALE);
        } else {
            logGeom('Updating existing curves');
            this.curve1.baseCurve = this.sourceCurve;
            this.curve2.baseCurve = this.sourceCurve;
        }

        // Chunked computation for mesh1 (0-50% progress)
        logGeom('Computing mesh1 positions (chunked)...');
        await this._computeTubePositionsChunked(this.mesh1.geometry, this.curve1, segments, 0.5, onProgress, abortSignal, 0);
        if (abortSignal?.cancelled) {
            logGeom('ABORTED after mesh1');
            endTimer('wire-updateGeometryAsync');
            return;
        }

        // Chunked computation for mesh2 (50-100% progress)
        logGeom('Computing mesh2 positions (chunked)...');
        await this._computeTubePositionsChunked(this.mesh2.geometry, this.curve2, segments, 0.5, onProgress, abortSignal, 50);
        endTimer('wire-updateGeometryAsync');
        logGeom('updateGeometryAsync() complete');
    }

    /**
     * Compute tube positions in chunks, yielding to event loop between chunks
     */
    async _computeTubePositionsChunked(geometry, curve, segments, progressWeight, onProgress, abortSignal, progressOffset = 0) {
        const CHUNK_SIZE = 200; // Segments per chunk (~10ms work)
        const radial = this.radialSegments;
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const uvs = geometry.attributes.uv.array;

        const P = this._tubeP;
        const T = this._tubeT;
        const N = this._tubeN;
        const B = this._tubeB;
        const vertex = this._tubeVertex;

        for (let chunkStart = 0; chunkStart <= segments; chunkStart += CHUNK_SIZE) {
            // Check for abort
            if (abortSignal?.cancelled) return;

            const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, segments + 1);

            // Process chunk
            for (let i = chunkStart; i < chunkEnd; i++) {
                const t = i / segments;

                curve.getPoint(t, P);
                curve.getTangent(t, T).normalize();

                if (Math.abs(T.y) > 0.99) {
                    N.set(1, 0, 0);
                } else {
                    N.set(0, 1, 0);
                }
                B.crossVectors(T, N).normalize();
                N.crossVectors(B, T).normalize();

                for (let j = 0; j <= radial; j++) {
                    const sin = this._radialSin[j];
                    const cos = this._radialCos[j];

                    vertex.x = P.x + this.thickness * (cos * N.x + sin * B.x);
                    vertex.y = P.y + this.thickness * (cos * N.y + sin * B.y);
                    vertex.z = P.z + this.thickness * (cos * N.z + sin * B.z);

                    const vertIdx = (i * (radial + 1) + j) * 3;
                    positions[vertIdx] = vertex.x;
                    positions[vertIdx + 1] = vertex.y;
                    positions[vertIdx + 2] = vertex.z;

                    normals[vertIdx] = cos * N.x + sin * B.x;
                    normals[vertIdx + 1] = cos * N.y + sin * B.y;
                    normals[vertIdx + 2] = cos * N.z + sin * B.z;

                    const uvIdx = (i * (radial + 1) + j) * 2;
                    uvs[uvIdx] = t;
                    uvs[uvIdx + 1] = j / radial;
                }
            }

            // Report progress
            if (onProgress) {
                const chunkProgress = (chunkEnd / (segments + 1)) * 100 * progressWeight;
                onProgress(progressOffset + chunkProgress);
            }

            // Yield to event loop via setTimeout (NOT rAF - rAF is throttled in background tabs)
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Final buffer updates
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.normal.needsUpdate = true;
        geometry.attributes.uv.needsUpdate = true;
        geometry.computeBoundingSphere();
    }
}
