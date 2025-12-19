// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║                           BULB CREATION                                   ║
// ║  createBulbInstance - creates a light bulb with glass, filament, socket   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';
import { CONFIG, SOCKET_THEMES } from '../config.js';
import { getBulbPalette, HelixCurve } from '../utils.js';
import { logInfo } from '../debug.js';

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

    const yOffset = -0.55;
    const qualityMap = { low: 32, medium: 108, high: 180, ultra: 256 };
    const tubeSegments = qualityMap[CONFIG.QUALITY] || 180;

    // Filament - uses emissive for self-illumination
    const filGeo = new THREE.TubeGeometry(new HelixCurve(), tubeSegments, 0.03, 8, false);
    const filMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: palette.filament,
        emissiveIntensity: initialBrightness
    });
    const filament = new THREE.Mesh(filGeo, filMat);
    filament.position.y = yOffset;
    lightGroup.add(filament);

    // Glass
    const glassQuality = { low: 16, medium: 48, high: 88, ultra: 128 };
    const glassSegments = glassQuality[CONFIG.QUALITY] || 88;
    const pts = [new THREE.Vector2(0.22, 0.0), new THREE.Vector2(0.45, 0.4), new THREE.Vector2(0.55, 0.9), new THREE.Vector2(0.40, 1.8), new THREE.Vector2(0.0, 2.6)];
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
    bulb.position.y = yOffset;
    lightGroup.add(bulb);

    // Socket
    const socketQuality = { low: 8, medium: 24, high: 44, ultra: 64 };
    const socketSegments = socketQuality[CONFIG.QUALITY] || 44;
    const sPts = [new THREE.Vector2(0.45, 0.5), new THREE.Vector2(0.47, 0.5), new THREE.Vector2(0.46, 0.3), new THREE.Vector2(0.42, 0.0), new THREE.Vector2(0.25, -0.4), new THREE.Vector2(0.15, -0.6), new THREE.Vector2(0, -0.65)];
    const sShape = new THREE.LatheGeometry(new THREE.SplineCurve(sPts).getPoints(socketSegments), socketSegments);

    // Determine socket color: use wire color if WIRE_MATCH, else use metal theme
    const socketColorHex = (CONFIG.SOCKET_THEME === 'WIRE_MATCH' || !SOCKET_THEMES[CONFIG.SOCKET_THEME])
        ? activeWireColorA
        : SOCKET_THEMES[CONFIG.SOCKET_THEME];
    const sMat = new THREE.MeshStandardMaterial({ color: socketColorHex, roughness: 0.3, metalness: 0.6, envMapIntensity: 0.8, side: THREE.DoubleSide });
    const socket = new THREE.Mesh(sShape, sMat);

    socket.position.y = -0.1 + yOffset;
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
