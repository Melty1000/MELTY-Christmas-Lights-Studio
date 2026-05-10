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
//  SocketAttachment Class - Wire endpoint at socket top
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Represents a wire connection point at the top of a socket.
 * This is where wire segments terminate and bulbs anchor.
 */
export class SocketAttachment {
    constructor(index, tLocation, baseCurve) {
        this.index = index;               // Bulb index (or -1 for pin endpoints)
        this.tLocation = tLocation;       // Position on base curve [0,1]
        this.position = new THREE.Vector3();
        this.tangent = new THREE.Vector3();
        this.isPin = index < 0;           // True if this is a pin endpoint, not a bulb

        if (baseCurve) {
            this.update(baseCurve);
        }
    }

    /**
     * Update position and tangent from the base curve
     * @param {THREE.Curve} baseCurve - The underlying catenary curve
     */
    update(baseCurve) {
        baseCurve.getPoint(this.tLocation, this.position);
        baseCurve.getTangent(this.tLocation, this.tangent).normalize();
    }

    /**
     * Clone this attachment
     */
    clone() {
        const cloned = new SocketAttachment(this.index, this.tLocation, null);
        cloned.position.copy(this.position);
        cloned.tangent.copy(this.tangent);
        cloned.isPin = this.isPin;
        return cloned;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  WireSegment Class - Single wire section between two sockets
// ═══════════════════════════════════════════════════════════════════════════════

// Reusable vectors for WireSegment.getPoint
const _segNormal = new THREE.Vector3();
const _segBinormal = new THREE.Vector3();
const _segOffset = new THREE.Vector3();

/**
 * A single wire segment from one socket to the next.
 * Extends THREE.Curve so it can be used with existing tube geometry code.
 * NO dip logic - just smooth interpolation with helical twist.
 */
export class WireSegment extends THREE.Curve {
    constructor(startAttachment, endAttachment, turns, phase, offset) {
        super();
        this.start = startAttachment;     // SocketAttachment
        this.end = endAttachment;         // SocketAttachment
        this.turns = turns;               // Helix turns per unit length
        this.phase = phase;               // Helix phase offset (0 or Math.PI)
        this.offset = offset;             // Helix radius (wire separation)

        // Precompute segment properties
        this.segmentLength = 0;
        this.tStart = startAttachment.tLocation;
        this.tEnd = endAttachment.tLocation;
        this.tRange = this.tEnd - this.tStart;

        this.updateLength();
    }

    /**
     * Update cached segment length
     */
    updateLength() {
        this.segmentLength = this.start.position.distanceTo(this.end.position);
    }

    /**
     * Get point on this wire segment
     * @param {number} t - Parameter [0,1] along THIS segment
     * @param {THREE.Vector3} target - Optional target vector
     */
    getPoint(t, target = new THREE.Vector3()) {
        // Linear interpolation between start and end positions
        target.lerpVectors(this.start.position, this.end.position, t);

        // Calculate tangent for helix frame
        const tangent = _segNormal.subVectors(this.end.position, this.start.position).normalize();

        // Build local frame (same logic as TwistedCurve)
        const normal = _segBinormal.set(0, 1, 0);
        if (Math.abs(tangent.y) > 0.99) normal.set(1, 0, 0);
        const binormal = _segOffset.crossVectors(tangent, normal).normalize();
        normal.crossVectors(binormal, tangent).normalize();

        // Apply helical twist
        // Map segment t [0,1] to global t for consistent twist
        const globalT = this.tStart + t * this.tRange;
        const twistAngle = (globalT * this.turns * Math.PI * 2) + this.phase;
        const cx = Math.cos(twistAngle);
        const cy = Math.sin(twistAngle);

        // offsetDir = normal * cx + binormal * cy
        _segOffset.copy(normal).multiplyScalar(cx);
        _segOffset.addScaledVector(binormal, cy);

        // Apply offset
        target.addScaledVector(_segOffset, this.offset);

        return target;
    }

    /**
     * Get tangent at point on segment
     * @param {number} t - Parameter [0,1] along THIS segment
     * @param {THREE.Vector3} target - Optional target vector
     */
    getTangent(t, target = new THREE.Vector3()) {
        // For a linear segment, tangent is constant
        // But we include twist effect for consistency
        return target.subVectors(this.end.position, this.start.position).normalize();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TwistedCurve Class (LEGACY - kept for comparison during refactor)
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
        this.isBillboard = CONFIG.QUALITY === 'billboard';

        // --- TUNING THE U-SHAPE ---
        // Changed: narrower pinch (socket width, not bulb width)
        this.pinchRange = 0.003 + (this.bulbScale * 0.015);

        // Dip depth - same for both modes
        this.dipDepth = (1.5 * this.bulbScale) + this.offset;

        this.cornerSharpness = 8;
        // socketRadius: Keep same as offset so wires come straight down with even spacing
        // Changed from 0.002 which caused wires to converge in V shape
        this.socketRadius = this.offset;
        // Match bypass to offset so it stays perfectly aligned with the main spiral
        this.bypassRadius = this.offset;
    }

    getPoint(t, optionalTarget = new THREE.Vector3()) {
        const basePoint = this.baseCurve.getPoint(t);
        const tangent = this.baseCurve.getTangent(t).normalize();

        // Use reusable vectors instead of allocating new ones
        // Simple cross product approach for helix frame
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
                // REMOVED: Freeze Rotation - caused water-bottle twist
                // REMOVED: Shrink Radius - caused V-shape convergence
                // Wires maintain full offset through dip

                // DROP DOWN only (The Tight U-Shape)
                vertOffset = -this.dipDepth * influence;
            }
            else if (type === 'bypass') {
                rad = (this.offset * (1 - influence)) + (this.bypassRadius * influence);
            }

            const len = Math.sqrt(cx * cx + cy * cy);
            if (len > 0.001) { cx /= len; cy /= len; }
        }

        // Compute offset direction
        if (type === 'connect' && influence > 0) {
            // CONNECT POINTS: Use fixed horizontal offset (perpendicular to tangent, in XZ plane)
            // This prevents the V-shape - both wires maintain fixed horizontal separation
            const horizDir = _offsetDir.set(-tangent.z, 0, tangent.x).normalize();

            // Apply phase offset: phase 0 = one direction, phase PI = opposite
            const sign = Math.cos(this.phase) > 0 ? 1 : -1;
            _offsetDir.copy(horizDir).multiplyScalar(sign);

            // Blend between helix direction and fixed direction based on influence
            const helixDir = _tempVec.copy(normal).multiplyScalar(cx);
            _tempVec.addScaledVector(binormal, cy);

            // Full influence = fixed horizontal, no influence = helix
            _offsetDir.lerp(helixDir, 1 - influence);
        } else {
            // Normal helix: offsetDir = normal * cx + binormal * cy
            _offsetDir.copy(normal).multiplyScalar(cx);
            _tempVec.copy(binormal).multiplyScalar(cy);
            _offsetDir.add(_tempVec);
        }

        // finalPos = basePoint + offsetDir * rad
        _finalPos.copy(basePoint).addScaledVector(_offsetDir, rad);

        // Apply vertical drop using WORLD DOWN, not local normal
        // This ensures both wires dip straight down in parallel
        if (vertOffset !== 0) {
            _finalPos.y += vertOffset;  // World-space Y (down is negative)
        }

        // Billboard mode: push wire behind socket at connect points
        // Socket at z=0.05, push wire just slightly behind (not too far for lighting)
        if (this.isBillboard && type === 'connect' && influence > 0) {
            _finalPos.z = basePoint.z + 0.02 * influence;  // Small offset behind socket
        }

        return optionalTarget.copy(_finalPos);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Wire Class
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
//  WireNetwork Class - Manages all wire segments (NEW ARCHITECTURE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * WireNetwork manages a twisted wire pair as discrete segments.
 * Each segment terminates at a socket top position - no hidden dip geometry.
 * 
 * Usage:
 *   const network = new WireNetwork(baseCurve, bulbTLocations, config);
 *   network.updateSway(phase);  // Call each frame
 *   
 *   // Get bulb position:
 *   const pos = network.getAttachmentPosition(bulbIndex);
 */
export class WireNetwork {
    constructor(baseCurve, config = {}) {
        this.baseCurve = baseCurve;
        this.config = {
            turns: config.turns || 200,
            offset: config.offset || 0.02,
            thickness: config.thickness || 0.02,
            bulbScale: config.bulbScale || 0.1
        };

        // SocketAttachments indexed by bulb index
        this.attachments = new Map();

        // Wire segments for each wire in the pair
        // segments1 = wire with phase 0 (evens)
        // segments2 = wire with phase PI (odds)
        this.segments1 = [];
        this.segments2 = [];

        // Pin attachments (start and end)
        this.pinStart = new SocketAttachment(-1, 0, baseCurve);
        this.pinEnd = new SocketAttachment(-2, 1, baseCurve);
    }

    /**
     * Set bulb attachment points and build wire segments
     * @param {Array<Object>} lights - Array of bulb objects with userData.tLocation
     */
    setAttachmentPoints(lights) {
        // Create SocketAttachments for each bulb
        const tLocations = [];
        lights.forEach((light, index) => {
            const t = light.userData.tLocation;
            const attachment = new SocketAttachment(index, t, this.baseCurve);
            this.attachments.set(index, attachment);
            tLocations.push({ index, t, isEven: index % 2 === 0 });
        });

        // Sort by t-value
        tLocations.sort((a, b) => a.t - b.t);

        // Build segments for wire 1 (evens) and wire 2 (odds)
        this._buildSegments(tLocations);
    }

    /**
     * Build wire segments from sorted attachment points
     * Wire 1 (phase=0) connects to even-indexed bulbs
     * Wire 2 (phase=PI) connects to odd-indexed bulbs
     */
    _buildSegments(sortedLocations) {
        this.segments1 = [];
        this.segments2 = [];

        const evens = sortedLocations.filter(l => l.isEven);
        const odds = sortedLocations.filter(l => !l.isEven);

        // Wire 1: pin start → even bulbs → pin end
        this._buildSegmentsForWire(evens, 0, this.segments1);

        // Wire 2: pin start → odd bulbs → pin end
        this._buildSegmentsForWire(odds, Math.PI, this.segments2);
    }

    /**
     * Build segments for one wire
     * @param {Array} locations - Sorted array of {index, t, isEven}
     * @param {number} phase - Phase offset for helix (0 or PI)
     * @param {Array} outSegments - Array to fill with WireSegment instances
     */
    _buildSegmentsForWire(locations, phase, outSegments) {
        if (locations.length === 0) {
            // No bulbs on this wire - single segment from pin to pin
            outSegments.push(new WireSegment(
                this.pinStart,
                this.pinEnd,
                this.config.turns,
                phase,
                this.config.offset
            ));
            return;
        }

        // First segment: pin start → first bulb
        const firstBulb = this.attachments.get(locations[0].index);
        outSegments.push(new WireSegment(
            this.pinStart,
            firstBulb,
            this.config.turns,
            phase,
            this.config.offset
        ));

        // Middle segments: bulb → next bulb
        for (let i = 0; i < locations.length - 1; i++) {
            const fromBulb = this.attachments.get(locations[i].index);
            const toBulb = this.attachments.get(locations[i + 1].index);
            outSegments.push(new WireSegment(
                fromBulb,
                toBulb,
                this.config.turns,
                phase,
                this.config.offset
            ));
        }

        // Last segment: last bulb → pin end
        const lastBulb = this.attachments.get(locations[locations.length - 1].index);
        outSegments.push(new WireSegment(
            lastBulb,
            this.pinEnd,
            this.config.turns,
            phase,
            this.config.offset
        ));
    }

    /**
     * Update all positions for sway animation
     * @param {THREE.Curve} updatedBaseCurve - Base curve with sway applied
     */
    updateFromCurve(updatedBaseCurve) {
        this.baseCurve = updatedBaseCurve;

        // Update pin attachments
        this.pinStart.update(updatedBaseCurve);
        this.pinEnd.update(updatedBaseCurve);

        // Update all bulb attachments
        this.attachments.forEach(attachment => {
            attachment.update(updatedBaseCurve);
        });

        // Update segment lengths
        this.segments1.forEach(seg => seg.updateLength());
        this.segments2.forEach(seg => seg.updateLength());
    }

    /**
     * Get the socket attachment for a bulb
     * @param {number} bulbIndex - Bulb index
     * @returns {SocketAttachment}
     */
    getAttachment(bulbIndex) {
        return this.attachments.get(bulbIndex);
    }

    /**
     * Get the position where a bulb should be placed (socket top)
     * @param {number} bulbIndex - Bulb index
     * @returns {THREE.Vector3}
     */
    getAttachmentPosition(bulbIndex) {
        const attachment = this.attachments.get(bulbIndex);
        return attachment ? attachment.position : null;
    }

    /**
     * Get tangent at a bulb's attachment point
     * @param {number} bulbIndex - Bulb index
     * @returns {THREE.Vector3}
     */
    getAttachmentTangent(bulbIndex) {
        const attachment = this.attachments.get(bulbIndex);
        return attachment ? attachment.tangent : null;
    }

    /**
     * Get total segment count for geometry allocation
     * @returns {{segments1: number, segments2: number}}
     */
    getSegmentCounts() {
        return {
            segments1: this.segments1.length,
            segments2: this.segments2.length
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Wire Class (LEGACY - uses TwistedCurve with dip logic)
// ═══════════════════════════════════════════════════════════════════════════════

export class Wire {
    constructor(curve, color1, color2, thickness, offset, turns, scene) {
        this.sourceCurve = curve;
        this.thickness = thickness;
        this.offset = offset;
        this.turns = turns;
        this.scene = scene;
        this.group = new THREE.Group();

        // Billboard mode: use flat ribbon instead of 3D tube
        this.isBillboard = CONFIG.QUALITY === 'billboard';

        this.material1 = new THREE.MeshStandardMaterial({
            color: color1,
            roughness: 0.4,
            metalness: 0.35,
            envMapIntensity: 0.6,
            side: this.isBillboard ? THREE.DoubleSide : THREE.FrontSide  // Ribbon needs double-sided
        });
        this.material2 = new THREE.MeshStandardMaterial({
            color: color2,
            roughness: 0.4,
            metalness: 0.35,
            envMapIntensity: 0.6,
            side: this.isBillboard ? THREE.DoubleSide : THREE.FrontSide
        });

        // Create meshes with empty BufferGeometry (will be populated by initializeBufferGeometry)
        this.mesh1 = new THREE.Mesh(new THREE.BufferGeometry(), this.material1);
        this.mesh2 = new THREE.Mesh(new THREE.BufferGeometry(), this.material2);

        // Apply Z offsets from debug panel (for parallax tuning in billboard mode)
        // Push wires slightly BACK (negative Z) so socket at Z+0.002 properly masks them
        const zOffsets = window.zDebugOffsets || { wireA: 0, wireB: 0 };
        this.mesh1.position.z = zOffsets.wireA - 0.02;  // Behind socket
        this.mesh2.position.z = zOffsets.wireB - 0.02;  // Behind socket

        // Wires should render BEFORE socket so socket can mask them
        this.mesh1.renderOrder = -10;
        this.mesh2.renderOrder = -10;

        this.group.add(this.mesh1);
        this.group.add(this.mesh2);
        scene.add(this.group);

        this.allBulbs = [];

        // BufferGeometry tracking
        this.currentSegments = 0;
        // Billboard uses 1 radial segment (2 vertices per point), 3D uses 8 (9 vertices per point)
        this.radialSegments = this.isBillboard ? 1 : 8;
        this.geometryInitialized = false;

        // Pre-compute radial sin/cos (same values reused 4000+ times per frame)
        // For billboard (radialSegments=1): use 0 and π to get opposite sides
        // For 3D tube: use full circle 0 to 2π
        this._radialSin = [];
        this._radialCos = [];
        for (let j = 0; j <= this.radialSegments; j++) {
            // Billboard: spread across π (half circle = ribbon)
            // 3D: spread across 2π (full circle = tube)
            const maxAngle = this.isBillboard ? Math.PI : Math.PI * 2;
            const v = j / this.radialSegments * maxAngle;
            this._radialSin.push(Math.sin(v));
            this._radialCos.push(Math.cos(v));
        }

        // Reusable Vector3 instances for computeTubePositions (avoid per-call GC)
        this._tubeP = new THREE.Vector3();
        this._tubeT = new THREE.Vector3();
        this._tubeN = new THREE.Vector3();
        this._tubeB = new THREE.Vector3();
        this._tubeVertex = new THREE.Vector3();

        // Reusable vectors for Double Reflection algorithm (avoid per-iteration GC)
        this._rmfV1 = new THREE.Vector3();
        this._rmfV2 = new THREE.Vector3();
        this._rmfRL = new THREE.Vector3();
        this._rmfTL = new THREE.Vector3();
        this._rmfTemp = new THREE.Vector3();

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
        // Debug: Allow high wire quality with billboard bulbs for testing
        let quality = CONFIG.QUALITY;
        if (quality === 'billboard' && CONFIG.BILLBOARD_DEBUG_HIGH_WIRE) {
            quality = 'high';  // Use high quality wire for debugging billboard attachment
        }
        const qualityMap = { low: 150, medium: 750, high: 1400, ultra: 2000, billboard: 500 };
        let segments = qualityMap[quality] || 1400;
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
                // Triangle winding: counter-clockwise for outward-facing normals
                // Reversed order to fix hollow tube appearance (was showing inside-back)
                indices[idx++] = a;
                indices[idx++] = d;
                indices[idx++] = b;
                indices[idx++] = b;
                indices[idx++] = d;
                indices[idx++] = c;
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

        // Fixed reference vectors for world-aligned framing (prevents twist accumulation)
        const worldUp = new THREE.Vector3(0, 1, 0);
        const worldRight = new THREE.Vector3(1, 0, 0);

        // RESET RMF state for this curve (prevents contamination between curve1 and curve2)
        this._rmfPrevP = null;
        this._rmfPrevT = null;
        this._rmfPrevN = null;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;

            // Get point and tangent from curve
            curve.getPoint(t, P);
            curve.getTangent(t, T).normalize();

            if (this.isBillboard) {
                // Billboard ribbon: expand toward camera (Z axis)
                // Use tangent × world-forward to get horizontal ribbon direction
                B.crossVectors(T, new THREE.Vector3(0, 0, 1)).normalize();
                if (B.length() < 0.01) B.set(1, 0, 0);  // Fallback if tangent is parallel to Z
                N.set(0, 0, 1);  // Normal always faces camera
            } else {
                // 3D tube: use DOUBLE REFLECTION METHOD for Rotation Minimizing Frames
                // This algorithm provides smooth frame propagation without twist accumulation
                // Reference: Wang et al. "Computation of Rotation Minimizing Frames"

                if (i === 0) {
                    // Initialize first frame using simple cross product (matches TwistedCurve)
                    const refVec = Math.abs(T.y) > 0.99 ? worldRight : worldUp;
                    B.crossVectors(T, refVec).normalize();
                    N.crossVectors(B, T).normalize();

                    // Initialize storage vectors for next iteration
                    if (!this._rmfPrevP) this._rmfPrevP = new THREE.Vector3();
                    if (!this._rmfPrevT) this._rmfPrevT = new THREE.Vector3();
                    if (!this._rmfPrevN) this._rmfPrevN = new THREE.Vector3();
                } else {
                    // Double Reflection Method:
                    // 1. Reflect previous frame's vectors across plane perpendicular to v1 (position chord)
                    // 2. Reflect again across plane perpendicular to v2

                    const prevP = this._rmfPrevP;
                    const prevT = this._rmfPrevT;
                    const prevN = this._rmfPrevN;

                    // v1 = x_{i+1} - x_i (POSITION CHORD, not tangent!)
                    const v1 = this._rmfV1.subVectors(P, prevP);
                    const c1 = v1.dot(v1);

                    if (c1 > 0.0001) {
                        // First reflection: R_L = R - (2/c1) * (v1 · R) * v1
                        const v1DotN = v1.dot(prevN);
                        const rL = this._rmfRL.copy(prevN).sub(
                            this._rmfTemp.copy(v1).multiplyScalar(2 * v1DotN / c1)
                        );

                        // t_L = t_i - (2/c1) * (v1 · t_i) * v1
                        const v1DotT = v1.dot(prevT);
                        const tL = this._rmfTL.copy(prevT).sub(
                            this._rmfTemp.copy(v1).multiplyScalar(2 * v1DotT / c1)
                        );

                        // v2 = t_{i+1} - t_L
                        const v2 = this._rmfV2.subVectors(T, tL);
                        const c2 = v2.dot(v2);

                        if (c2 > 0.0001) {
                            // Second reflection: R_{i+1} = R_L - (2/c2) * (v2 · R_L) * v2
                            const v2DotRL = v2.dot(rL);
                            N.copy(rL).sub(this._rmfTemp.copy(v2).multiplyScalar(2 * v2DotRL / c2));
                        } else {
                            N.copy(rL);
                        }
                    } else {
                        // Position unchanged, keep previous normal
                        N.copy(prevN);
                    }

                    // Re-orthonormalize: remove any component of N along T
                    // (Double Reflection can accumulate numerical error)
                    const nDotT = N.dot(T);
                    N.sub(this._rmfTemp.copy(T).multiplyScalar(nDotT));
                    N.normalize();

                    B.crossVectors(T, N).normalize();
                }

                // Store for next iteration
                this._rmfPrevP.copy(P);
                this._rmfPrevT.copy(T);
                this._rmfPrevN.copy(N);
            }

            // Generate radial vertices (using cached sin/cos)
            for (let j = 0; j <= radial; j++) {
                const sin = this._radialSin[j];
                const cos = this._radialCos[j];

                if (this.isBillboard) {
                    // Billboard: expand along B but keep Z flat (ribbon parallel to camera)
                    const dir = j === 0 ? -1 : 1;
                    vertex.x = P.x + this.thickness * dir * B.x;
                    vertex.y = P.y + this.thickness * dir * B.y;
                    vertex.z = P.z;  // Keep Z same as curve point - no Z expansion
                } else {
                    // 3D tube: use full radial calculation
                    vertex.x = P.x + this.thickness * (cos * N.x + sin * B.x);
                    vertex.y = P.y + this.thickness * (cos * N.y + sin * B.y);
                    vertex.z = P.z + this.thickness * (cos * N.z + sin * B.z);
                }

                const vertIdx = (i * (radial + 1) + j) * 3;
                positions[vertIdx] = vertex.x;
                positions[vertIdx + 1] = vertex.y;
                positions[vertIdx + 2] = vertex.z;

                // Normal (points upward for billboard to receive light, outward for tube)
                if (this.isBillboard) {
                    normals[vertIdx] = 0;
                    normals[vertIdx + 1] = 1;  // Face upward toward lights
                    normals[vertIdx + 2] = 0;
                } else {
                    normals[vertIdx] = cos * N.x + sin * B.x;
                    normals[vertIdx + 1] = cos * N.y + sin * B.y;
                    normals[vertIdx + 2] = cos * N.z + sin * B.z;
                }

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
     * Update geometry using WireNetwork segments (NEW ARCHITECTURE - no dip)
     * Each segment is computed independently and combined into the mesh buffers.
     * @param {WireNetwork} network - The WireNetwork with pre-built segments
     */
    updateGeometryFromNetwork(network) {
        if (!network) {
            console.warn('Wire.updateGeometryFromNetwork: No network provided, falling back to legacy');
            return this.updateGeometry();
        }

        // Get segments from network
        const segments1 = network.segments1;
        const segments2 = network.segments2;

        if (!segments1.length || !segments2.length) {
            console.warn('Wire.updateGeometryFromNetwork: Network has no segments');
            return;
        }

        // Calculate total tube segments needed
        // Each WireSegment contributes proportionally to its length
        const totalLength1 = segments1.reduce((sum, seg) => sum + seg.segmentLength, 0);
        const totalLength2 = segments2.reduce((sum, seg) => sum + seg.segmentLength, 0);
        const totalSegments = this.calculateSegmentCount();

        // Check if we need to rebuild buffers
        if (!this.geometryInitialized || totalSegments !== this.currentSegments) {
            this.initializeBufferGeometry(totalSegments);
        }

        // Compute geometry for each wire
        this._computeNetworkGeometry(this.mesh1.geometry, segments1, totalLength1, totalSegments);
        this._computeNetworkGeometry(this.mesh2.geometry, segments2, totalLength2, totalSegments);
    }

    /**
     * Compute geometry for a set of WireSegments into a single BufferGeometry
     * @param {THREE.BufferGeometry} geometry - Target geometry
     * @param {Array<WireSegment>} segments - Array of WireSegment curves
     * @param {number} totalLength - Total length of all segments
     * @param {number} totalTubeSegments - Total number of tube segments to generate
     */
    _computeNetworkGeometry(geometry, segments, totalLength, totalTubeSegments) {
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const uvs = geometry.attributes.uv.array;
        const radial = this.radialSegments;

        // Track position in buffer
        let tubeIdx = 0;

        // Reset RMF state for fresh start
        this._rmfFirstFrame = true;

        // Process each segment
        for (let segIdx = 0; segIdx < segments.length; segIdx++) {
            const segment = segments[segIdx];

            // Allocate tube segments proportionally to segment length
            const segmentWeight = segment.segmentLength / totalLength;
            const segmentTubeCount = Math.max(2, Math.round(totalTubeSegments * segmentWeight));

            // Reset RMF at start of each segment (independent frame)
            this._rmfFirstFrame = true;

            // Generate tube vertices for this segment
            for (let i = 0; i <= segmentTubeCount; i++) {
                const t = i / segmentTubeCount;

                // Get position and tangent from segment curve
                const P = segment.getPoint(t);
                const T = segment.getTangent(t);

                // Compute normal using simple cross product (no RMF for now)
                // This is simpler and avoids discontinuity at segment boundaries
                const upRef = Math.abs(T.y) > 0.99
                    ? new THREE.Vector3(1, 0, 0)
                    : new THREE.Vector3(0, 1, 0);
                const N = new THREE.Vector3().crossVectors(T, upRef).normalize();
                const B = new THREE.Vector3().crossVectors(N, T).normalize();

                // Generate ring of vertices
                for (let j = 0; j <= radial; j++) {
                    const sin = this._radialSin[j];
                    const cos = this._radialCos[j];

                    // Vertex position
                    const vertex = new THREE.Vector3(
                        P.x + (cos * N.x + sin * B.x) * this.thickness,
                        P.y + (cos * N.y + sin * B.y) * this.thickness,
                        P.z + (cos * N.z + sin * B.z) * this.thickness
                    );

                    const vertIdx = (tubeIdx * (radial + 1) + j) * 3;
                    positions[vertIdx] = vertex.x;
                    positions[vertIdx + 1] = vertex.y;
                    positions[vertIdx + 2] = vertex.z;

                    // Normal
                    if (this.isBillboard) {
                        normals[vertIdx] = 0;
                        normals[vertIdx + 1] = 1;
                        normals[vertIdx + 2] = 0;
                    } else {
                        normals[vertIdx] = cos * N.x + sin * B.x;
                        normals[vertIdx + 1] = cos * N.y + sin * B.y;
                        normals[vertIdx + 2] = cos * N.z + sin * B.z;
                    }

                    // UV (global t across entire wire)
                    const uvIdx = (tubeIdx * (radial + 1) + j) * 2;
                    const globalT = (segIdx + t) / segments.length;
                    uvs[uvIdx] = globalT;
                    uvs[uvIdx + 1] = j / radial;
                }

                tubeIdx++;

                // Safety check
                if (tubeIdx > totalTubeSegments + 1) break;
            }

            // Skip the last point of each segment (will be duplicated by next segment's first point)
            // Actually, we want continuity, so we DON'T skip - the geometry has gaps at sockets
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.normal.needsUpdate = true;
        geometry.attributes.uv.needsUpdate = true;
        geometry.computeBoundingSphere();
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
