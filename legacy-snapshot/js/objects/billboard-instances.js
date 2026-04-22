// ═══════════════════════════════════════════════════════════════════════════════
//  Billboard Instanced Mesh System
//  Renders all billboard bulbs using THREE.InstancedMesh for maximum performance
// ═══════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { CONFIG, THEMES, WIRE_THEMES, SOCKET_THEMES } from '../config.js';

// Shared geometries (created once, reused for all instances)
let sharedGlassGeometry = null;
let sharedFilamentGeometry = null;
let sharedSocketGeometry = null;

/**
 * Create shared billboard geometries (called once on init)
 */
function createSharedGeometries() {
    if (sharedGlassGeometry) return; // Already created

    // Glass bulb silhouette
    const bulbShape = new THREE.Shape();
    bulbShape.moveTo(-0.22, 0);
    bulbShape.bezierCurveTo(-0.45, 0, -0.55, -0.5, -0.55, -0.9);
    bulbShape.bezierCurveTo(-0.55, -1.5, -0.35, -2.2, 0.0, -2.6);
    bulbShape.bezierCurveTo(0.35, -2.2, 0.55, -1.5, 0.55, -0.9);
    bulbShape.bezierCurveTo(0.55, -0.5, 0.45, 0, 0.22, 0);
    bulbShape.lineTo(-0.22, 0);
    sharedGlassGeometry = new THREE.ShapeGeometry(bulbShape, 12);

    // Filament sine wave
    const filShape = new THREE.Shape();
    const coilWidth = 0.10, coilHeight = 1.2, loops = 3, amplitude = 0.28, segments = 50;
    filShape.moveTo(-coilWidth / 2, coilHeight / 2);
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const y = coilHeight / 2 - t * coilHeight;
        const x = Math.sin(t * loops * Math.PI * 2) * amplitude - coilWidth / 2;
        filShape.lineTo(x, y);
    }
    for (let i = segments; i >= 0; i--) {
        const t = i / segments;
        const y = coilHeight / 2 - t * coilHeight;
        const x = Math.sin(t * loops * Math.PI * 2) * amplitude + coilWidth / 2;
        filShape.lineTo(x, y);
    }
    filShape.lineTo(-coilWidth / 2, coilHeight / 2);
    sharedFilamentGeometry = new THREE.ShapeGeometry(filShape, 1);

    // Socket silhouette
    const socketShape = new THREE.Shape();
    socketShape.moveTo(-0.48, 0);
    socketShape.bezierCurveTo(-0.47, 0.4, -0.40, 0.8, -0.15, 1.15);
    socketShape.lineTo(0.15, 1.15);
    socketShape.bezierCurveTo(0.40, 0.8, 0.47, 0.4, 0.48, 0);
    socketShape.lineTo(-0.48, 0);
    sharedSocketGeometry = new THREE.ShapeGeometry(socketShape, 8);
}

/**
 * Custom shader material for instanced bulbs with per-instance color, emissive, and matcap dome effect
 */
function createInstancedBulbMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            baseOpacity: { value: CONFIG.GLASS_OPACITY },
            baseEmissiveIntensity: { value: CONFIG.EMISSIVE_INTENSITY }
        },
        vertexShader: `
            attribute vec3 instanceColor;
            attribute float instanceEmissive;
            
            varying vec3 vColor;
            varying float vEmissive;
            varying vec3 vLocalPos;
            varying vec3 vViewPos;
            
            void main() {
                vColor = instanceColor;
                vEmissive = instanceEmissive;
                vLocalPos = position;
                
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                vViewPos = mvPosition.xyz;
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float baseOpacity;
            uniform float baseEmissiveIntensity;
            
            varying vec3 vColor;
            varying float vEmissive;
            varying vec3 vLocalPos;
            varying vec3 vViewPos;
            
            void main() {
                // Normalize local position to [-1, 1] range for dome calculation
                // Bulb shape is roughly X: -0.55 to 0.55, Y: 0 to -2.6
                vec2 normalized = vec2(
                    vLocalPos.x / 0.55,  // X from -1 to 1
                    (vLocalPos.y + 1.3) / 1.3  // Y: remap -2.6..0 to -1..1
                );
                
                // Calculate dome height at this point (hemisphere equation)
                float r2 = dot(normalized, normalized);
                float domeHeight = 1.0 - r2;
                
                // Create spherical normal (pointing outward from dome surface)
                float z = sqrt(max(0.01, domeHeight));
                vec3 domeNormal = normalize(vec3(normalized.x * 0.8, normalized.y * 0.8, z));
                
                // Simple view space transform for dome normal
                vec3 viewDir = normalize(-vViewPos);
                
                // Calculate lighting based on dome normal
                float NdotV = max(0.0, dot(domeNormal, vec3(0.0, 0.0, 1.0)));
                float highlight = pow(NdotV, 1.5);
                float rim = pow(1.0 - NdotV, 2.0) * 0.5;
                
                // Top light simulation
                float topLight = max(0.0, dot(domeNormal, normalize(vec3(0.0, 0.5, 1.0))));
                
                // Combine lighting
                float lighting = 0.3 + topLight * 0.4 + highlight * 0.6;
                
                // Emissive contribution
                vec3 emissiveColor = vColor * vEmissive * baseEmissiveIntensity;
                
                // Final color
                vec3 finalColor = vColor * lighting * 0.5 + emissiveColor;
                
                // Specular highlight (white)
                float specular = pow(max(0.0, dot(domeNormal, normalize(vec3(0.2, 0.3, 1.0)))), 8.0);
                finalColor += vec3(specular * 0.5);
                
                // Rim glow for depth
                finalColor += vColor * rim * 0.3;
                
                gl_FragColor = vec4(finalColor, baseOpacity);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true
    });
}

/**
 * Billboard Bulb Instances Manager
 * Creates and manages InstancedMesh objects for all billboard bulbs
 */
export class BillboardBulbInstances {
    constructor(count, scene, wireColors) {
        createSharedGeometries();

        this.count = count;
        this.scene = scene;
        this.wireColors = wireColors;  // { A: 0xXXXXXX, B: 0xXXXXXX }

        // Create materials
        this.glassMaterial = createInstancedBulbMaterial();

        // Filament shader (simple emissive, no parallax needed)
        this.filamentMaterial = new THREE.ShaderMaterial({
            uniforms: {
                baseEmissiveIntensity: { value: 1.0 }
            },
            vertexShader: `
                attribute vec3 instanceColor;
                attribute float instanceEmissive;
                
                varying vec3 vColor;
                varying float vEmissive;
                
                void main() {
                    vColor = instanceColor;
                    vEmissive = instanceEmissive;
                    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float baseEmissiveIntensity;
                varying vec3 vColor;
                varying float vEmissive;
                void main() {
                    gl_FragColor = vec4(vColor * vEmissive * baseEmissiveIntensity, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });

        // Socket shader (simple with dome effect, no parallax needed)
        this.socketMaterial = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `
                attribute vec3 instanceColor;
                
                varying vec3 vColor;
                varying vec3 vLocalPos;
                varying vec3 vViewPos;
                
                void main() {
                    vColor = instanceColor;
                    vLocalPos = position;
                    
                    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                    vViewPos = mvPosition.xyz;
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying vec3 vLocalPos;
                varying vec3 vViewPos;
                
                void main() {
                    // Socket shape: X: -0.48 to 0.48, Y: 0 to 1.15
                    vec2 normalized = vec2(
                        vLocalPos.x / 0.48,
                        (vLocalPos.y - 0.575) / 0.575  // Center around 0.575
                    );
                    
                    // Dome normal calculation
                    float r2 = dot(normalized, normalized);
                    float domeHeight = 1.0 - r2;
                    float z = sqrt(max(0.01, domeHeight));
                    vec3 domeNormal = normalize(vec3(normalized.x * 0.6, normalized.y * 0.6, z));
                    
                    // View direction from view-space position (dynamic during sway)
                    vec3 viewDir = normalize(-vViewPos);
                    
                    // Lighting - use view direction for dynamic response
                    float NdotV = max(0.0, dot(domeNormal, viewDir));
                    float highlight = pow(NdotV, 1.5);
                    
                    // Top light (fixed, gives consistent ambient feel)
                    float topLight = max(0.0, dot(domeNormal, normalize(vec3(0.0, 0.5, 1.0))));
                    
                    float lighting = 0.4 + topLight * 0.3 + highlight * 0.4;
                    vec3 finalColor = vColor * lighting;
                    
                    // Dynamic specular based on view position
                    vec3 reflectDir = reflect(-viewDir, domeNormal);
                    float specular = pow(max(0.0, dot(reflectDir, normalize(vec3(0.2, 0.3, 1.0)))), 6.0);
                    finalColor += vec3(specular * 0.2);
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.DoubleSide,
            depthWrite: true,
            depthTest: true
        });

        // Create InstancedMeshes
        this.glassInstances = new THREE.InstancedMesh(sharedGlassGeometry, this.glassMaterial, count);
        this.filamentInstances = new THREE.InstancedMesh(sharedFilamentGeometry, this.filamentMaterial, count);
        this.socketInstances = new THREE.InstancedMesh(sharedSocketGeometry, this.socketMaterial, count);

        // Use renderOrder for proper transparency rendering
        // OPAQUE elements (socket) must draw FIRST to establish depth buffer
        // TRANSPARENT elements (glass, filament) draw SECOND and test against depth
        this.socketInstances.renderOrder = 0;    // FIRST: opaque, establishes depth
        this.glassInstances.renderOrder = 10;    // SECOND: transparent, tests depth
        this.filamentInstances.renderOrder = 11; // LAST: emissive, tests depth

        // Add per-instance attributes for color and emissive intensity
        const colors = new Float32Array(count * 3);
        const emissives = new Float32Array(count);
        const socketColors = new Float32Array(count * 3);

        this.glassInstances.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors.slice(), 3));
        this.glassInstances.geometry.setAttribute('instanceEmissive', new THREE.InstancedBufferAttribute(emissives.slice(), 1));

        this.filamentInstances.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors.slice(), 3));
        this.filamentInstances.geometry.setAttribute('instanceEmissive', new THREE.InstancedBufferAttribute(emissives.slice(), 1));

        // Socket has its own color attribute for WIRE_MATCH
        this.socketInstances.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(socketColors, 3));

        // Enable frustum culling
        this.glassInstances.frustumCulled = true;
        this.filamentInstances.frustumCulled = true;
        this.socketInstances.frustumCulled = true;

        // Add to scene
        scene.add(this.glassInstances);
        scene.add(this.filamentInstances);
        scene.add(this.socketInstances);

        // Store per-instance data
        this.instanceData = [];
        this._matrix = new THREE.Matrix4();
        this._position = new THREE.Vector3();
        this._quaternion = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
    }

    /**
     * Set instance transform and color
     * @param socketColor - Socket color (for WIRE_MATCH, this is the attached wire color)
     */
    setInstance(index, position, quaternion, scale, color, socketColor, emissiveIntensity = 1.0) {
        const bulbScale = CONFIG.BULB_SCALE;

        // Get Y offsets from debug panel (Z offsets removed - using renderOrder for layering)
        const offsets = window.zDebugOffsets || {
            glassY: -1.40, filamentY: -0.80, socketY: -1.75
        };

        // Y offsets only - all elements at same Z (eliminates parallax)
        const glassYOffset = offsets.glassY * bulbScale;
        const filamentYOffset = offsets.filamentY * bulbScale;
        const socketYOffset = offsets.socketY * bulbScale;

        this._scale.set(bulbScale, bulbScale, bulbScale);

        // Wire base Z offset - bulbs must match wire Z position (-0.02)
        const wireZOffset = -0.02;

        // All elements at wire Z position - renderOrder controls layering
        // Glass
        this._position.set(position.x, position.y + glassYOffset, position.z + wireZOffset);
        this._matrix.compose(this._position, quaternion, this._scale);
        this.glassInstances.setMatrixAt(index, this._matrix);

        // Filament - relative Y offset from glass, same Z
        this._position.set(position.x, position.y + glassYOffset + filamentYOffset, position.z + wireZOffset);
        this._matrix.compose(this._position, quaternion, this._scale);
        this.filamentInstances.setMatrixAt(index, this._matrix);

        // Socket - closest to camera (front)
        // Just 0.002 ahead of wire base for masking (not 0.022!)
        this._position.set(position.x, position.y + socketYOffset, position.z + wireZOffset + 0.002);
        this._matrix.compose(this._position, quaternion, this._scale);
        this.socketInstances.setMatrixAt(index, this._matrix);

        // Set bulb colors (glass and filament)
        const colorObj = new THREE.Color(color);
        const colorAttr = this.glassInstances.geometry.attributes.instanceColor;
        colorAttr.setXYZ(index, colorObj.r, colorObj.g, colorObj.b);

        const filColorAttr = this.filamentInstances.geometry.attributes.instanceColor;
        filColorAttr.setXYZ(index, colorObj.r, colorObj.g, colorObj.b);

        // Set socket color (for WIRE_MATCH support)
        const socketColorObj = new THREE.Color(socketColor);
        const socketColorAttr = this.socketInstances.geometry.attributes.instanceColor;
        socketColorAttr.setXYZ(index, socketColorObj.r, socketColorObj.g, socketColorObj.b);

        // Set emissive intensity
        const emissiveAttr = this.glassInstances.geometry.attributes.instanceEmissive;
        emissiveAttr.setX(index, emissiveIntensity);

        const filEmissiveAttr = this.filamentInstances.geometry.attributes.instanceEmissive;
        filEmissiveAttr.setX(index, emissiveIntensity);

        // Store data for animation
        this.instanceData[index] = { color: colorObj, emissive: emissiveIntensity };
    }

    /**
     * Update emissive intensity for a single instance (for twinkle animation)
     */
    updateEmissive(index, intensity) {
        const emissiveAttr = this.glassInstances.geometry.attributes.instanceEmissive;
        emissiveAttr.setX(index, intensity);
        emissiveAttr.needsUpdate = true;

        const filEmissiveAttr = this.filamentInstances.geometry.attributes.instanceEmissive;
        filEmissiveAttr.setX(index, intensity);
        filEmissiveAttr.needsUpdate = true;
    }

    /**
     * Update just the position of an instance (for sway animation)
     * @param {number} index - Instance index
     * @param {THREE.Vector3} position - New position
     * @param {THREE.Quaternion} quaternion - Rotation quaternion
     */
    updatePosition(index, position, quaternion) {
        const bulbScale = CONFIG.BULB_SCALE;

        const offsets = window.zDebugOffsets || {
            glassY: -1.40, filamentY: -0.80, socketY: -1.75
        };

        const glassYOffset = offsets.glassY * bulbScale;
        const filamentYOffset = offsets.filamentY * bulbScale;
        const socketYOffset = offsets.socketY * bulbScale;
        const wireZOffset = -0.02;

        // Y correction: helix curves (curve1/curve2) are below the catenary
        // Apply upward offset like 3D billboard mode does
        const helixYCorrection = 1.6 * bulbScale;

        this._scale.set(bulbScale, bulbScale, bulbScale);

        // Glass - add helix Y correction
        this._position.set(position.x, position.y + glassYOffset + helixYCorrection, position.z + wireZOffset);
        this._matrix.compose(this._position, quaternion, this._scale);
        this.glassInstances.setMatrixAt(index, this._matrix);

        // Filament
        this._position.set(position.x, position.y + glassYOffset + filamentYOffset + helixYCorrection, position.z + wireZOffset);
        this._matrix.compose(this._position, quaternion, this._scale);
        this.filamentInstances.setMatrixAt(index, this._matrix);

        // Socket
        this._position.set(position.x, position.y + socketYOffset + helixYCorrection, position.z + wireZOffset + 0.002);
        this._matrix.compose(this._position, quaternion, this._scale);
        this.socketInstances.setMatrixAt(index, this._matrix);
    }

    /**
     * Mark instance matrices as needing update (call after setInstance batch)
     */
    updateMatrices() {
        this.glassInstances.instanceMatrix.needsUpdate = true;
        this.filamentInstances.instanceMatrix.needsUpdate = true;
        this.socketInstances.instanceMatrix.needsUpdate = true;

        this.glassInstances.geometry.attributes.instanceColor.needsUpdate = true;
        this.glassInstances.geometry.attributes.instanceEmissive.needsUpdate = true;
        this.filamentInstances.geometry.attributes.instanceColor.needsUpdate = true;
        this.filamentInstances.geometry.attributes.instanceEmissive.needsUpdate = true;
        this.socketInstances.geometry.attributes.instanceColor.needsUpdate = true;
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        this.scene.remove(this.glassInstances);
        this.scene.remove(this.filamentInstances);
        this.scene.remove(this.socketInstances);

        this.glassInstances.dispose();
        this.filamentInstances.dispose();
        this.socketInstances.dispose();

        this.glassMaterial.dispose();
        this.filamentMaterial.dispose();
        this.socketMaterial.dispose();
    }
}

/**
 * Dispose shared geometries (call on full cleanup)
 */
export function disposeSharedGeometries() {
    if (sharedGlassGeometry) {
        sharedGlassGeometry.dispose();
        sharedGlassGeometry = null;
    }
    if (sharedFilamentGeometry) {
        sharedFilamentGeometry.dispose();
        sharedFilamentGeometry = null;
    }
    if (sharedSocketGeometry) {
        sharedSocketGeometry.dispose();
        sharedSocketGeometry = null;
    }
}
