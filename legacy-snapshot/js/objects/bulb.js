// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                           BULB CREATION                                   ║
// ║  createBulbInstance - creates a light bulb with glass, filament, socket   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG, SOCKET_THEMES } from '../config.js';
import { getBulbPalette, HelixCurve } from '../utils.js';
import { logInfo } from '../debug.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  GEOMETRY CONSTANTS - Used for wire constraint calculations
// ═══════════════════════════════════════════════════════════════════════════════

// Socket top inner radius (unscaled) - determines max wire thickness/separation
export const SOCKET_TOP_RADIUS = 0.22;

// ═══════════════════════════════════════════════════════════════════════════════
//  createBulbInstance
// ═══════════════════════════════════════════════════════════════════════════════

// Bulb creation counter for debugging
let bulbCount = 0;

export function createBulbInstance(colorHex, themePalette, activeWireColorA) {
    bulbCount++;
    // Only log every 10th bulb to reduce noise
    if (bulbCount % 10 === 1) {
        logInfo('Bulb', `Creating bulb #${bulbCount}`, { colorHex, quality: CONFIG.QUALITY });
    }
    const lightGroup = new THREE.Group();
    const palette = getBulbPalette(colorHex);

    // Determine initial brightness - respect TWINKLE_MAX_INTENSITY when twinkle is off
    const initialBrightness = (CONFIG.TWINKLE_SPEED < 0.001)
        ? CONFIG.TWINKLE_MAX_INTENSITY
        : 1.0;

    // ═══════════════════════════════════════════════════════════════════════════
    // BILLBOARD MODE: Flat geometry for performance (streaming optimization)
    // ═══════════════════════════════════════════════════════════════════════════
    if (CONFIG.QUALITY === 'billboard') {
        const yOffset = -0.55;

        // Glass bulb silhouette - matches 3D LatheGeometry profile exactly
        // 3D profile: [0.22, 0], [0.45, 0.4], [0.55, 0.9], [0.40, 1.8], [0.0, 2.6]
        // Billboard: same profile but Y is negative (hangs down)
        const bulbShape = new THREE.Shape();

        // Left side (drawing counter-clockwise from base)
        bulbShape.moveTo(-0.22, 0);                                      // Base left
        bulbShape.bezierCurveTo(-0.45, 0, -0.55, -0.5, -0.55, -0.9);     // Smooth curve to max width
        bulbShape.bezierCurveTo(-0.55, -1.5, -0.35, -2.2, 0.0, -2.6);    // Smooth curve to tip

        // Right side (continuing from tip)
        bulbShape.bezierCurveTo(0.35, -2.2, 0.55, -1.5, 0.55, -0.9);     // Smooth curve from tip
        bulbShape.bezierCurveTo(0.55, -0.5, 0.45, 0, 0.22, 0);           // Smooth curve to base
        bulbShape.lineTo(-0.22, 0);                                      // Close

        const glassGeo = new THREE.ShapeGeometry(bulbShape, 12);
        const glassMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            emissive: colorHex,
            emissiveIntensity: CONFIG.EMISSIVE_INTENSITY * initialBrightness * 1.5,
            metalness: 0.0,
            roughness: CONFIG.GLASS_ROUGHNESS,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: CONFIG.GLASS_OPACITY,
            depthWrite: true
        });
        glassMat.userData.isBulbMaterial = true;
        const bulb = new THREE.Mesh(glassGeo, glassMat);
        bulb.position.y = yOffset;
        bulb.position.z = 0.05;               // Match socket Z to render in front of wire spiral
        lightGroup.add(bulb);

        // Filament - smooth coil shape that mimics 3D helix viewed from front
        // Creates a sine-wave pattern with thickness using curves
        const filShape = new THREE.Shape();
        const coilWidth = 0.10;   // Thicker wire
        const coilHeight = 1.2;   // Total height of coil
        const loops = 3;          // Less waves
        const amplitude = 0.28;   // Wider swing
        const segments = 50;      // High resolution for smooth curve

        // Draw smooth sine wave outline
        // Left edge going down (outer edge of wire)
        filShape.moveTo(-coilWidth / 2, coilHeight / 2);

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = coilHeight / 2 - t * coilHeight;
            const x = Math.sin(t * loops * Math.PI * 2) * amplitude - coilWidth / 2;
            if (i === 0) continue;
            filShape.lineTo(x, y);
        }

        // Right edge going up (inner edge of wire)
        for (let i = segments; i >= 0; i--) {
            const t = i / segments;
            const y = coilHeight / 2 - t * coilHeight;
            const x = Math.sin(t * loops * Math.PI * 2) * amplitude + coilWidth / 2;
            filShape.lineTo(x, y);
        }

        filShape.lineTo(-coilWidth / 2, coilHeight / 2);  // Close

        const filGeo = new THREE.ShapeGeometry(filShape, 1);
        const filMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: palette.filament,
            emissiveIntensity: initialBrightness,
            side: THREE.DoubleSide
        });
        const filament = new THREE.Mesh(filGeo, filMat);
        filament.position.y = yOffset - 0.8;  // Positioned near socket
        filament.position.z = -0.02;          // Behind glass
        lightGroup.add(filament);

        // Socket silhouette - matches 3D screw-base shape
        // 3D socket height: 1.15 (y=0.5 to y=-0.65), bulb: 2.6, ratio: 44%
        const socketShape = new THREE.Shape();
        socketShape.moveTo(-0.48, 0);                                    // Bottom left (subtle flare)
        socketShape.bezierCurveTo(-0.47, 0.4, -0.40, 0.8, -0.15, 1.15);  // Left curve - smooth taper to top
        socketShape.lineTo(0.15, 1.15);                                  // Top edge
        socketShape.bezierCurveTo(0.40, 0.8, 0.47, 0.4, 0.48, 0);        // Right curve - smooth taper from top
        socketShape.lineTo(-0.48, 0);                                    // Close bottom

        const socketGeo = new THREE.ShapeGeometry(socketShape, 8);
        const socketColorHex = (CONFIG.SOCKET_THEME === 'WIRE_MATCH' || !SOCKET_THEMES[CONFIG.SOCKET_THEME])
            ? activeWireColorA
            : SOCKET_THEMES[CONFIG.SOCKET_THEME];
        const sMat = new THREE.MeshStandardMaterial({
            color: socketColorHex,
            roughness: 0.3,
            metalness: 0.6,
            envMapIntensity: 0.8,
            side: THREE.DoubleSide
        });
        const socket = new THREE.Mesh(socketGeo, sMat);
        socket.position.y = yOffset;          // Same base as bulb - they share y=0 junction
        socket.position.z = 0.05;             // Push forward in Z to render in front of twisted wire spiral
        lightGroup.add(socket);

        // Point light (same as 3D mode)
        let pointLight = null;
        if (CONFIG.POINT_LIGHTS_ENABLED && (!window._pointLightCount || window._pointLightCount < 100)) {
            pointLight = new THREE.PointLight(colorHex, 0.5 * initialBrightness, 2.0, 2);
            pointLight.position.set(0, 0.3, 0);
            lightGroup.add(pointLight);
            window._pointLightCount = (window._pointLightCount || 0) + 1;
        }

        // userData (same structure as 3D mode for compatibility)
        lightGroup.userData = {
            glass: glassMat,
            filament: filMat,  // Filament material for twinkle animation
            baseFilament: palette.filament.clone(),
            baseEmissive: CONFIG.EMISSIVE_INTENSITY,
            themePalette: themePalette,
            paletteIndex: themePalette.indexOf(colorHex),
            currentThemeName: CONFIG.ACTIVE_THEME || 'CHRISTMAS',
            currentIntensity: initialBrightness,
            targetIntensity: 1.0,
            state: 'HOLD',
            timer: Math.random() * 1.0,
            step: 0,
            pointLight: pointLight,
            baseColor: new THREE.Color(colorHex),
            socketMaterial: sMat,
            isBillboard: true  // Flag for renderer to use lookAt
        };

        lightGroup.scale.setScalar(CONFIG.BULB_SCALE);
        return lightGroup;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // END BILLBOARD MODE
    // ═══════════════════════════════════════════════════════════════════════════


    // yOffset positions the group so socket TOP is at local Y=0 (wire connection point)
    // Socket narrow end (wire connection) should be at the group origin
    const yOffset = 0;  // No offset needed - geometry built correctly oriented
    // Segment counts reduced proportionally to shorter helix (0.85 vs 1.25 = 68%)
    const qualityMap = { low: 22, medium: 72, high: 120, ultra: 170 };
    const tubeSegments = qualityMap[CONFIG.QUALITY] || 120;

    // Filament - uses emissive for self-illumination
    // radialSegments reduced from 8 to 6 (hexagonal cross-section, less visible at this scale)
    const filGeo = new THREE.TubeGeometry(new HelixCurve(), tubeSegments, 0.03, 6, false);
    const filMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: palette.filament,
        emissiveIntensity: initialBrightness
    });
    const filament = new THREE.Mesh(filGeo, filMat);
    filament.position.y = -1.93;  // Top of helix at socket base cap (Y=-0.98)
    lightGroup.add(filament);

    // Glass
    const glassQuality = { low: 16, medium: 48, high: 88, ultra: 128 };
    const glassSegments = glassQuality[CONFIG.QUALITY] || 88;
    // Glass profile: TRUNCATED at socket base (hidden geometry removed)
    // Cut at socket base Y=-0.98, radius halfway between inner (0.44) and outer (0.47)
    const pts = [new THREE.Vector2(0.455, -0.98), new THREE.Vector2(0.55, -1.47), new THREE.Vector2(0.40, -2.37), new THREE.Vector2(0.0, -3.17)];
    const shape = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(glassSegments), glassSegments);

    // Performance: MeshStandardMaterial replaces MeshPhysicalMaterial
    // (transmission/ior/clearcoat removed - bloom handles glow effect)
    const glassMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: CONFIG.EMISSIVE_INTENSITY * initialBrightness * 1.5, // Boosted to compensate
        metalness: 0.0,
        roughness: CONFIG.GLASS_ROUGHNESS,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: CONFIG.GLASS_OPACITY,
        depthWrite: true
    });

    glassMat.userData.isBulbMaterial = true;
    const bulb = new THREE.Mesh(shape, glassMat);
    bulb.position.y = 0;  // Glass geometry already positioned correctly
    lightGroup.add(bulb);

    // Socket
    const socketQuality = { low: 8, medium: 24, high: 44, ultra: 64 };
    const socketSegments = socketQuality[CONFIG.QUALITY] || 44;
    // Socket profile: curves INWARD at top to form a rim/lip
    // Profile goes from bottom to top (base to rim)
    // Smooth curve all the way to flat top - no vertical section
    // Socket "cut off" at a lower Y position - larger top diameter, shorter socket
    // Uses SOCKET_TOP_RADIUS constant for wire constraint calculations
    const sPts = [
        new THREE.Vector2(0, -0.98),                 // Center cap (closes bottom)
        new THREE.Vector2(0.20, -0.98),              // Cap intermediate (keeps cap flat)
        new THREE.Vector2(0.40, -0.98),              // Cap intermediate
        new THREE.Vector2(0.45, -0.98),              // Base edge (bottom)
        new THREE.Vector2(0.47, -0.98),              // Base outer
        new THREE.Vector2(0.46, -0.81),              // Taper up
        new THREE.Vector2(0.42, -0.55),              // Widest part
        new THREE.Vector2(0.32, -0.21),              // Narrowing toward top
        new THREE.Vector2(SOCKET_TOP_RADIUS, 0)      // Flat top - uses exported constant
    ];
    const sShape = new THREE.LatheGeometry(new THREE.SplineCurve(sPts).getPoints(socketSegments), socketSegments);

    // Determine socket color: use wire color if WIRE_MATCH, else use metal theme
    const socketColorHex = (CONFIG.SOCKET_THEME === 'WIRE_MATCH' || !SOCKET_THEMES[CONFIG.SOCKET_THEME])
        ? activeWireColorA
        : SOCKET_THEMES[CONFIG.SOCKET_THEME];
    const sMat = new THREE.MeshStandardMaterial({ color: socketColorHex, roughness: 0.3, metalness: 0.6, envMapIntensity: 0.8, side: THREE.FrontSide });
    const socket = new THREE.Mesh(sShape, sMat);

    socket.position.y = 0;  // Socket top (wire connection) at origin Y=0
    lightGroup.add(socket);

    // Add colored point light for reflections (limited to max 100 to prevent shader errors)
    let pointLight = null;
    if (CONFIG.POINT_LIGHTS_ENABLED && (!window._pointLightCount || window._pointLightCount < 100)) {
        pointLight = new THREE.PointLight(colorHex, 0.5 * initialBrightness, 2.0, 2);
        pointLight.position.set(0, 0.3, 0);
        lightGroup.add(pointLight);
        window._pointLightCount = (window._pointLightCount || 0) + 1;
    }

    lightGroup.userData = {
        glass: glassMat,
        filament: filMat,
        baseFilament: palette.filament.clone(),
        baseEmissive: CONFIG.EMISSIVE_INTENSITY,
        themePalette: themePalette,
        paletteIndex: themePalette.indexOf(colorHex),
        currentThemeName: CONFIG.ACTIVE_THEME || 'CHRISTMAS',
        currentIntensity: initialBrightness,
        targetIntensity: 1.0,
        state: 'HOLD',
        timer: Math.random() * 1.0,
        step: 0,
        pointLight: pointLight,
        baseColor: new THREE.Color(colorHex),
        socketMaterial: sMat
    };

    lightGroup.scale.setScalar(CONFIG.BULB_SCALE);
    return lightGroup;
}
