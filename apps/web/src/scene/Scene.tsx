import { Stars, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ACESFilmicToneMapping,
  type AmbientLight,
  CatmullRomCurve3,
  type DirectionalLight,
  Group,
  HalfFloatType,
  type HemisphereLight,
  type Mesh,
  type OrthographicCamera,
  NoToneMapping,
  type ShaderMaterial,
  Color,
  Vector3,
} from 'three';
import {
  BloomEffect,
  EffectPass,
  type EffectComposer as EffectComposerImpl,
} from 'postprocessing';
import {
  DEFAULT_CONFIG,
  SOCKET_THEMES,
  THEMES,
  WIRE_THEMES,
  type Config,
} from '@melty/shared';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { BillboardBulbs } from './BillboardBulbs.tsx';
import { SnowField } from './SnowField.tsx';
import { bulbTLocationsForSpans } from './utils.ts';
import { generateLightLayoutPaths, type LightLayoutPath } from './wire/basePoints.ts';
import { allocateRibbonBuffers, writeRibbonPositions } from './wire/buildRibbonGeometry.ts';
import { ribbonSegmentCount } from './wire/buildTubeGeometry.ts';
import { createWireMaterial } from './wire/createWireMaterial.ts';
import { sampleBulbGuide } from './wire/bulbGuide.ts';
import { pointSpillCol, pointSpillCount, pointSpillPos } from './wire/pointSpillState.ts';
import { TwistedCurve } from './wire/TwistedCurve.ts';
import { AlphaLift } from './effects/AlphaLift.tsx';
import { socketJoinZBackLimit } from './bulbMetrics.ts';

const _K_LIGHT_TO = new Vector3();
const _F_LIGHT_TO = new Vector3();
const _bulbGuide = new Vector3();

const BACKGROUND_COLOR = '#08111d';
const ORTHO_VIEW_HEIGHT = 18;
const ORTHO_BASE_DISTANCE = 22;
const ORTHO_CAMERA_DISTANCE = 100;
const CAMERA_FORWARD = new Vector3(0, 4.8, -15).normalize();
const ORTHO_SCREEN_Y_SCALE = Math.sqrt(1 - CAMERA_FORWARD.y * CAMERA_FORWARD.y);
const BLOOM_INTENSITY_CEILING = 2.4;
const BLOOM_RESPONSE_CURVE = 1.1;
const POSTPROCESS_BLOOM_SCALE = 0.06;
const BLOOM_THRESHOLD_FLOOR = 0.96;
const _cameraTarget = new Vector3();
const _cameraEye = new Vector3();

// ---------------------------------------------------------------------------
// Structural vs. continuous config
// ---------------------------------------------------------------------------
//
// Before this split, `Scene` subscribed to the whole config object. Every
// slider tick produced a new config reference, which re-rendered Scene →
// Canvas → every child under R3F, including the 80-item pointLight list in
// BillboardBulbs. That's the reason dragging BULB_SCALE / EMISSIVE /
// AMBIENT / CAMERA_* felt heavy: React was reconciling an entire 3D scene
// graph per pixel of drag.
//
// The fix is to subscribe only to *structural* fields — the ones that
// change mount/unmount, geometry topology, theme lookups, or feature
// toggles. Everything else (continuous intensities, camera position, sway,
// bloom params, bulb scale, glass opacity) is read imperatively in
// useFrame via `useConfigStore.getState()`, so dragging those sliders just
// updates the next GL frame without any React work.
interface StructuralConfig {
  NUM_PINS: number;
  LIGHTS_PER_SEGMENT: number;
  SAG_AMPLITUDE: number;
  TENSION: number;
  WIRE_SEPARATION: number;
  WIRE_THICKNESS: number;
  WIRE_TWISTS: number;
  LIGHT_LAYOUT: Config['LIGHT_LAYOUT'];
  LAYOUT_MARGIN: number;
  LAYOUT_SCALE: number;
  LAYOUT_OFFSET_X: number;
  LAYOUT_OFFSET_Y: number;
  WIRE_THEME: Config['WIRE_THEME'];
  SOCKET_THEME: Config['SOCKET_THEME'];
  ACTIVE_THEME: Config['ACTIVE_THEME'];
  BULB_SCALE: number;
  POINT_LIGHTS_ENABLED: boolean;
  POSTFX_ENABLED: boolean;
  BACKGROUND_ENABLED: boolean;
  ANTIALIAS_ENABLED: boolean;
  STATS_ENABLED: boolean;
  STARS_ENABLED: boolean;
  STARS_COUNT: number;
  STARS_SIZE: number;
  STARS_TWINKLE_SPEED: number;
  SNOW_ENABLED: boolean;
  SNOW_COUNT: number;
  SNOW_SPEED: number;
  SNOW_SIZE: number;
  SNOW_DRIFT: number;
}

function selectStructural(state: { config: Config }): StructuralConfig {
  const c = state.config;
  return {
    NUM_PINS: c.NUM_PINS,
    LIGHTS_PER_SEGMENT: c.LIGHTS_PER_SEGMENT,
    SAG_AMPLITUDE: c.SAG_AMPLITUDE,
    TENSION: c.TENSION,
    WIRE_SEPARATION: c.WIRE_SEPARATION,
    WIRE_THICKNESS: c.WIRE_THICKNESS,
    WIRE_TWISTS: c.WIRE_TWISTS,
    LIGHT_LAYOUT: c.LIGHT_LAYOUT,
    LAYOUT_MARGIN: c.LAYOUT_MARGIN,
    LAYOUT_SCALE: c.LAYOUT_SCALE,
    LAYOUT_OFFSET_X: c.LAYOUT_OFFSET_X,
    LAYOUT_OFFSET_Y: c.LAYOUT_OFFSET_Y,
    WIRE_THEME: c.WIRE_THEME,
    SOCKET_THEME: c.SOCKET_THEME,
    ACTIVE_THEME: c.ACTIVE_THEME,
    BULB_SCALE: c.BULB_SCALE,
    POINT_LIGHTS_ENABLED: c.POINT_LIGHTS_ENABLED,
    POSTFX_ENABLED: c.POSTFX_ENABLED,
    BACKGROUND_ENABLED: c.BACKGROUND_ENABLED,
    ANTIALIAS_ENABLED: c.ANTIALIAS_ENABLED,
    STATS_ENABLED: c.STATS_ENABLED,
    STARS_ENABLED: c.STARS_ENABLED,
    STARS_COUNT: c.STARS_COUNT,
    STARS_SIZE: c.STARS_SIZE,
    STARS_TWINKLE_SPEED: c.STARS_TWINKLE_SPEED,
    SNOW_ENABLED: c.SNOW_ENABLED,
    SNOW_COUNT: c.SNOW_COUNT,
    SNOW_SPEED: c.SNOW_SPEED,
    SNOW_SIZE: c.SNOW_SIZE,
    SNOW_DRIFT: c.SNOW_DRIFT,
  };
}

export function Scene() {
  // `useShallow` returns the same object ref when every field is ===, so
  // Scene only re-renders when a *structural* field actually changes.
  // Dragging BULB_SCALE, AMBIENT_INTENSITY, CAMERA_*, BLOOM_*, SWAY_*, etc.
  // does NOT land here.
  const structural = useConfigStore(useShallow(selectStructural));

  return (
    <Canvas
      key={`scene-${structural.ANTIALIAS_ENABLED ? 'aa' : 'noaa'}`}
      orthographic
      camera={{
        far: 500,
        near: 0.1,
        position: [0, 0, ORTHO_CAMERA_DISTANCE],
        // CameraPose derives the real zoom from canvas height so identical
        // aspect ratios frame the same at 720p, 1080p, 1440p, and OBS sizes.
        zoom: 60,
      }}
      dpr={[1, 2]}
      gl={{
        alpha: true,
        antialias: structural.ANTIALIAS_ENABLED,
        premultipliedAlpha: false,
        // Wires are paper-thin in places; log-z reduces z-fighting when two
        // ribbons (or a ribbon and the socket) sit at near-equal depth.
        logarithmicDepthBuffer: true,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = NoToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <SceneContent structural={structural} />
    </Canvas>
  );
}

function SceneContent({ structural }: { structural: StructuralConfig }) {
  const activeTheme = THEMES[structural.ACTIVE_THEME];
  const wireTheme = WIRE_THEMES[structural.WIRE_THEME];
  const size = useThree((state) => state.size);
  const swayGroupRef = useRef<Group>(null);
  const ambientRef = useRef<AmbientLight>(null);
  const keyLightRef = useRef<DirectionalLight>(null);
  const fillLightRef = useRef<DirectionalLight>(null);
  const hemiLightRef = useRef<HemisphereLight>(null);
  // We reach the BloomEffect through the EffectComposer ref rather than a
  // direct ref on <Bloom>. `@react-three/postprocessing`'s `wrapEffect`
  // uses `JSON.stringify(props)` as a useMemo dep (util.tsx:34), and in
  // React 19 `ref` is now a regular prop. A ref on <Bloom> ends up in the
  // stringified props, which then walks into the Three.js parent/children
  // cycle on the resolved BloomEffect and throws "Converting circular
  // structure to JSON". <EffectComposer> DOES use forwardRef so this path
  // is safe, and we find the Bloom pass by walking composer.passes each
  // frame — cheap and lets us tune intensity/threshold imperatively with
  // zero React work on slider drag.
  const composerRef = useRef<EffectComposerImpl>(null);
  const bloomEffectRef = useRef<BloomEffect | null>(null);
  const gl = useThree((state) => state.gl);

  // Keep renderer tone mapping in sync with the PostFX toggle. With PostFX on,
  // the composer applies tone mapping after Bloom has worked on linear HDR
  // values — so the renderer must stay in NoToneMapping to avoid mapping
  // twice (which collapsed the scene to near-black whenever the opaque
  // background was off). With PostFX off, the renderer itself handles it.
  useEffect(() => {
    gl.toneMapping = structural.POSTFX_ENABLED ? NoToneMapping : ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;
  }, [gl, structural.POSTFX_ENABLED]);

  const layoutViewport = useMemo(() => {
    const aspect = size.height > 0 ? size.width / size.height : 16 / 9;
    return {
      width: ORTHO_VIEW_HEIGHT * aspect,
      height: ORTHO_VIEW_HEIGHT / ORTHO_SCREEN_Y_SCALE,
    };
  }, [size.height, size.width]);

  const layoutPaths = useMemo(
    () =>
      generateLightLayoutPaths({
        layout: structural.LIGHT_LAYOUT,
        viewport: layoutViewport,
        numPins: structural.NUM_PINS,
        sagAmplitude: structural.SAG_AMPLITUDE,
        tension: structural.TENSION,
        margin: structural.LAYOUT_MARGIN,
        scale: structural.LAYOUT_SCALE,
        offsetX: structural.LAYOUT_OFFSET_X,
        offsetY: structural.LAYOUT_OFFSET_Y,
      }),
    [
      layoutViewport,
      structural.LIGHT_LAYOUT,
      structural.LAYOUT_MARGIN,
      structural.LAYOUT_OFFSET_X,
      structural.LAYOUT_OFFSET_Y,
      structural.LAYOUT_SCALE,
      structural.NUM_PINS,
      structural.SAG_AMPLITUDE,
      structural.TENSION,
    ],
  );

  // Imperative per-frame updater for every continuous slider we no longer
  // subscribe to. Reading `useConfigStore.getState()` is zero-cost and
  // returns the current state synchronously, so sliders controlling these
  // values never trigger a React render — the next GL frame just picks up
  // the new number.
  useFrame(({ clock }) => {
    const c = useConfigStore.getState().config;

    const group = swayGroupRef.current;
    if (group) {
      const elapsed = clock.getElapsedTime();
      group.position.x = Math.sin(elapsed * 0.65) * c.SWAY_X * 0.18;
      group.position.z = Math.cos(elapsed * 0.45) * c.SWAY_Z * 0.16;
    }

    if (ambientRef.current) ambientRef.current.intensity = c.AMBIENT_INTENSITY;
    if (keyLightRef.current) keyLightRef.current.intensity = c.KEY_LIGHT_INTENSITY;
    if (fillLightRef.current) fillLightRef.current.intensity = c.FILL_LIGHT_INTENSITY;
    if (hemiLightRef.current) hemiLightRef.current.intensity = c.HEMI_LIGHT_INTENSITY;

    // Bloom live-tune. We cache the BloomEffect instance the first time we
    // see it by walking composer.passes[].effects. Writing to the instance
    // directly avoids a React re-render on every BLOOM_* drag AND avoids
    // the wrapEffect JSON.stringify(props) hazard that Bloom props would
    // trigger on any prop change.
    let bloom = bloomEffectRef.current;
    if (!bloom) {
      const composer = composerRef.current;
      if (composer) {
        for (const pass of composer.passes) {
          if (pass instanceof EffectPass) {
            // EffectPass keeps its effects in a private-ish `effects` array
            // that's been on the public class since postprocessing 6.x.
            const effects = (pass as unknown as { effects: readonly unknown[] }).effects;
            if (effects) {
              for (const eff of effects) {
                if (eff instanceof BloomEffect) {
                  bloom = eff;
                  bloomEffectRef.current = eff;
                  break;
                }
              }
            }
          }
          if (bloom) break;
        }
      }
    }
    if (bloom) {
      // Visible bulb glow is handled by explicit colored halo billboards in
      // BillboardBulbs. This post bloom pass now stays tiny: it only catches
      // the hottest bulb pixels for sparkle instead of turning bright wires
      // and sockets into ambient light.
      bloom.intensity = computeBloomIntensity(c.BLOOM_STRENGTH, c.BLOOM_INTENSITY) * POSTPROCESS_BLOOM_SCALE;
      const lum = bloom.luminanceMaterial;
      if (lum?.uniforms?.threshold) {
        lum.uniforms.threshold.value = Math.max(BLOOM_THRESHOLD_FLOOR, c.BLOOM_THRESHOLD);
      }
    }
  });

  return (
    <>
      {structural.BACKGROUND_ENABLED ? (
        <color attach="background" args={[BACKGROUND_COLOR]} />
      ) : null}
      <CameraPose />

      <ambientLight ref={ambientRef} intensity={0} />
      <directionalLight
        name="melt-key"
        ref={keyLightRef}
        intensity={0}
        position={[0, 12, 12]}
      />
      <directionalLight
        name="melt-fill"
        ref={fillLightRef}
        intensity={0}
        position={[0, 4, -12]}
      />
      <hemisphereLight name="melt-hemi" ref={hemiLightRef} args={['#eef5ff', '#0a0a12', 0]} />

      {structural.STARS_ENABLED ? (
        <Stars
          count={structural.STARS_COUNT}
          depth={22}
          fade
          factor={Math.max(0.3, structural.STARS_SIZE * 5)}
          radius={38}
          saturation={0}
          speed={structural.STARS_TWINKLE_SPEED}
        />
      ) : null}

      {structural.SNOW_ENABLED ? (
        <SnowField
          count={structural.SNOW_COUNT}
          speed={structural.SNOW_SPEED}
          size={structural.SNOW_SIZE}
          drift={structural.SNOW_DRIFT}
        />
      ) : null}

      {/* Per-bulb halo geometry carries the visible colored glow. The global
          Bloom pass stays post-FX-only so it cannot wash the scene like
          ambient light. */}
      <group ref={swayGroupRef}>
        {layoutPaths.map((path, index) => (
          <LightString
            key={path.id}
            path={path}
            structural={structural}
            activeTheme={activeTheme}
            wireTheme={wireTheme}
            resetPointSpill={index === 0}
          />
        ))}
      </group>

      {structural.POSTFX_ENABLED ? (
        <PostFX
          antialiased={structural.ANTIALIAS_ENABLED}
          backgroundEnabled={structural.BACKGROUND_ENABLED}
          composerRef={composerRef}
        />
      ) : null}

      {structural.STATS_ENABLED ? <Stats className="!left-4 !top-4" /> : null}
    </>
  );
}

function LightString({
  path,
  structural,
  activeTheme,
  wireTheme,
  resetPointSpill,
}: {
  path: LightLayoutPath;
  structural: StructuralConfig;
  activeTheme: { bulbs: number[] };
  wireTheme: { A: number; B: number };
  resetPointSpill: boolean;
}) {
  const baseCurve = useMemo(
    () => new CatmullRomCurve3(path.points, path.closed ?? false, 'centripetal'),
    [path],
  );

  const locations = useMemo(
    () => bulbTLocationsForSpans(path.spanCount, structural.LIGHTS_PER_SEGMENT),
    [path.spanCount, structural.LIGHTS_PER_SEGMENT],
  );

  const evenLocations = useMemo(
    () => locations.filter((_, index) => index % 2 === 0),
    [locations],
  );

  const oddLocations = useMemo(
    () => locations.filter((_, index) => index % 2 !== 0),
    [locations],
  );
  const wireSeparation = structural.WIRE_SEPARATION;
  const wireTwists = structural.WIRE_TWISTS;
  const separationCompensation = Math.max(
    0,
    wireSeparation - DEFAULT_CONFIG.WIRE_SEPARATION,
  );

  const wireA = useMemo(
    () => new TwistedCurve(
      baseCurve,
      wireSeparation,
      wireTwists,
      0,
      evenLocations,
      oddLocations,
      structural.BULB_SCALE,
      true,
      path.bulbTarget,
      path.bulbGuidePoints,
      separationCompensation,
    ),
    [
      baseCurve,
      path.bulbGuidePoints,
      path.bulbTarget,
      structural.BULB_SCALE,
      wireTwists,
      wireSeparation,
      separationCompensation,
      evenLocations,
      oddLocations,
    ],
  );

  const wireB = useMemo(
    () => new TwistedCurve(
      baseCurve,
      wireSeparation,
      wireTwists,
      Math.PI,
      oddLocations,
      evenLocations,
      structural.BULB_SCALE,
      true,
      path.bulbTarget,
      path.bulbGuidePoints,
      separationCompensation,
    ),
    [
      baseCurve,
      path.bulbGuidePoints,
      path.bulbTarget,
      structural.BULB_SCALE,
      wireTwists,
      wireSeparation,
      separationCompensation,
      evenLocations,
      oddLocations,
    ],
  );

  const bulbData = useMemo(() => (
    locations.map((t, index) => {
      const point = baseCurve.getPoint(t);
      const direction = computeBulbDirection(baseCurve, t, point, path.bulbTarget, path.bulbGuidePoints);
      const socketColorHex = structural.SOCKET_THEME === 'WIRE_MATCH'
        ? (index % 2 === 0 ? wireTheme.A : wireTheme.B)
        : (SOCKET_THEMES[structural.SOCKET_THEME] ?? wireTheme.A);

      return {
        baseColorHex: activeTheme.bulbs[index % activeTheme.bulbs.length]!,
        position: [point.x, point.y, point.z] as [number, number, number],
        direction,
        socketColorHex,
      };
    })
  ), [activeTheme.bulbs, baseCurve, path.bulbGuidePoints, path.bulbTarget, structural.SOCKET_THEME, locations, wireTheme.A, wireTheme.B]);

  const segmentCount = ribbonSegmentCount(wireTwists);

  return (
    <>
      {/* Strand A and B are PI out of phase, so the weave depth offset in
          the shader pushes them in opposite directions every half-twist. */}
      <WireRibbon
        color={wireTheme.A}
        curve={wireA}
        segments={segmentCount}
        effectiveTwists={wireTwists}
        twistPhase={0}
        strandId={0}
      />
      <WireRibbon
        color={wireTheme.B}
        curve={wireB}
        segments={segmentCount}
        effectiveTwists={wireTwists}
        twistPhase={Math.PI}
        strandId={1}
      />
      <BillboardBulbs
        bulbs={bulbData}
        themePalette={activeTheme.bulbs}
        pointLightsEnabled={structural.POINT_LIGHTS_ENABLED}
        separationCompensation={separationCompensation}
        resetPointSpill={resetPointSpill}
      />
    </>
  );
}

function CameraPose() {
  const lastProjectionKey = useRef<string | null>(null);

  useFrame(({ camera, size }) => {
    const ortho = getOrthographicCamera(camera);
    if (!ortho) return;

    const c = useConfigStore.getState().config;
    const baseZoom = size.height > 0 ? size.height / ORTHO_VIEW_HEIGHT : 60;
    const zoom = baseZoom * (ORTHO_BASE_DISTANCE / Math.max(1, c.CAMERA_DISTANCE));
    const projectionKey = `${size.width}x${size.height}|${zoom.toFixed(4)}`;

    if (lastProjectionKey.current !== projectionKey) {
      lastProjectionKey.current = projectionKey;
      ortho.zoom = zoom;
      ortho.updateProjectionMatrix();
    }

    _cameraTarget.set(c.CAMERA_X, c.CAMERA_HEIGHT, 0);
    _cameraEye.copy(_cameraTarget).addScaledVector(CAMERA_FORWARD, -ORTHO_CAMERA_DISTANCE);
    ortho.position.copy(_cameraEye);
    ortho.up.set(0, 1, 0);
    ortho.lookAt(_cameraTarget);
  });

  return null;
}

function getOrthographicCamera(camera: unknown): OrthographicCamera | null {
  const maybe = camera as OrthographicCamera & { isOrthographicCamera?: boolean };
  return maybe.isOrthographicCamera ? maybe : null;
}

function computeBloomIntensity(strength: number, intensity: number): number {
  const raw = Math.max(0, strength) * Math.max(0, intensity);
  if (raw <= 0) return 0;
  return BLOOM_INTENSITY_CEILING * (1 - Math.exp(-raw / BLOOM_RESPONSE_CURVE));
}

function computeBulbDirection(
  curve: CatmullRomCurve3,
  t: number,
  point: Vector3,
  target: Vector3,
  guidePoints?: Vector3[],
): [number, number, number] {
  const tangent = curve.getTangent(t).normalize();
  let x = -tangent.y;
  let y = tangent.x;
  const guide = sampleBulbGuide(t, point, target, guidePoints, _bulbGuide);

  if ((x * guide.x) + (y * guide.y) < 0) {
    x = -x;
    y = -y;
  }

  const length = Math.hypot(x, y);
  if (length < 0.0001) return [0, -1, 0];
  return [x / length, y / length, 0];
}

// EffectComposer MUST receive effect children directly (Bloom, ToneMapping,
// wrapEffect wrappers). Wrapping <Bloom> in a React component made the
// composer's change-detection JSON.stringify walk into a circular Three.js
// `parent/children` structure and throw "Converting circular structure to
// JSON" at @react-three/postprocessing util.tsx:34. PostFX keeps everything
// flat.
//
// Two important constraints this component encodes:
//   1. We attach a ref to `<EffectComposer>` (which uses forwardRef and is
//      therefore safe). We do NOT attach a ref to `<Bloom>` — its wrapper
//      passes the whole props object to JSON.stringify every render, and a
//      React ref would end up inside there and walk into Three.js circular
//      refs.
//   2. Bloom props are kept stable and primitive. Changing any Bloom prop
//      rebuilds the BloomEffect instance (since the wrapper's useMemo key
//      is JSON.stringify(props) and it flows through to `args`). So we
//      update intensity/threshold imperatively in SceneContent's useFrame
//      via the composer-pass walk, and only BLOOM_RADIUS is React-driven
//      (radius changes the underlying kernel, which requires a rebuild —
//      no clean live-resize exposed — and users rarely touch it).
function PostFX({
  antialiased,
  backgroundEnabled,
  composerRef,
}: {
  antialiased: boolean;
  backgroundEnabled: boolean;
  composerRef: React.RefObject<EffectComposerImpl | null>;
}) {
  const bloomRadius = useConfigStore((s) => s.config.BLOOM_RADIUS);
  return (
    <EffectComposer
      ref={composerRef}
      multisampling={antialiased ? 8 : 0}
      frameBufferType={HalfFloatType}
    >
      {/* SceneContent useFrame keeps this threshold floored high enough that
          bright wires/sockets do not drive full-scene bloom. */}
      <Bloom
        luminanceThreshold={BLOOM_THRESHOLD_FLOOR}
        mipmapBlur
        intensity={POSTPROCESS_BLOOM_SCALE}
        radius={bloomRadius}
      />
      {/* AGX preserves hue at high intensity — ACES Filmic was collapsing
          saturated emissive bulbs toward white and spreading white through
          bloom. */}
      <ToneMapping mode={ToneMappingMode.AGX} />
      {/* AlphaLift stays mounted and we control it with `strength` instead
          of conditional mounting, so EffectComposer's child list stays
          stable. */}
      <AlphaLift strength={backgroundEnabled ? 0 : 1} />
    </EffectComposer>
  );
}

function WireRibbon({
  color,
  curve,
  segments,
  effectiveTwists,
  twistPhase,
  strandId,
}: {
  color: number;
  curve: TwistedCurve;
  segments: number;
  effectiveTwists: number;
  twistPhase: number;
  strandId: 0 | 1;
}) {
  const meshRef = useRef<Mesh>(null);
  const buffers = useMemo(() => allocateRibbonBuffers(segments), [segments]);
  const material = useMemo<ShaderMaterial>(
    () => createWireMaterial(color, twistPhase, strandId),
    [color, twistPhase, strandId],
  );
  const lastConnectZBack = useRef<string | null>(null);

  // Positions + tangents are camera-independent — only the shader's
  // extrusion depends on the view. Rewriting them once per curve change is
  // enough; no more per-frame CPU work on these buffers.
  useEffect(() => {
    writeRibbonPositions(buffers, curve);
  }, [buffers, curve]);

  useEffect(() => {
    const geometry = buffers.geometry;
    return () => {
      geometry.dispose();
    };
  }, [buffers]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  // priority 1: run after default (0) so Billboard point lights are written
  // to pointSpillState before we read it for the wire reflection term.
  useFrame((state) => {
    const c = useConfigStore.getState().config;
    const tW = c.WIRE_THICKNESS;
    // Zoomed out = worse depth; scale tuck and socket alignment with camera distance.
    const distScale = 1.0 + 0.055 * Math.max(0, c.CAMERA_DISTANCE - 9);
    const rawZBack = (0.04 + 0.3 * Math.min(1.75, 0.03 / (tW + 0.006))) * distScale;
    const zBack = Math.min(rawZBack, socketJoinZBackLimit(c.BULB_SCALE));
    const zKey = `${zBack.toFixed(6)}|${distScale.toFixed(3)}|${c.BULB_SCALE.toFixed(4)}`;
    if (lastConnectZBack.current !== zKey) {
      lastConnectZBack.current = zKey;
      curve.connectZBack = zBack;
      writeRibbonPositions(buffers, curve);
    }

    const u = material.uniforms;
    if (u.uTwists) u.uTwists.value = effectiveTwists;
    if (u.uAmbient) u.uAmbient.value = c.AMBIENT_INTENSITY;
    if (u.uThickness) u.uThickness.value = c.WIRE_THICKNESS;
    if (u.uWeaveDepth) {
      u.uWeaveDepth.value = Math.max(0.05, tW * 1.85);
    }
    if (u.uCollisionSpread) {
      u.uCollisionSpread.value = Math.max(0.002, tW * 0.12);
    }
    if (u.uPerTwistDepth) {
      u.uPerTwistDepth.value = Math.min(
        0.07,
        0.012 + 0.05 * Math.min(2.5, 0.034 / (tW + 0.011)),
      );
    }
    material.polygonOffsetFactor = 0;
    material.polygonOffsetUnits = 0;

    const scene = state.scene;
    const keyL = scene.getObjectByName('melt-key') as DirectionalLight | null;
    if (keyL && u.uKeyL && u.uKeyI) {
      keyL.getWorldDirection(_K_LIGHT_TO);
      _K_LIGHT_TO.negate();
      (u.uKeyL as { value: Vector3 }).value.copy(_K_LIGHT_TO);
      (u.uKeyI as { value: number }).value = c.KEY_LIGHT_INTENSITY;
    }
    const fillL = scene.getObjectByName('melt-fill') as DirectionalLight | null;
    if (fillL && u.uFillL && u.uFillI) {
      fillL.getWorldDirection(_F_LIGHT_TO);
      _F_LIGHT_TO.negate();
      (u.uFillL as { value: Vector3 }).value.copy(_F_LIGHT_TO);
      (u.uFillI as { value: number }).value = c.FILL_LIGHT_INTENSITY;
    }
    const hemiL = scene.getObjectByName('melt-hemi') as HemisphereLight | null;
    if (hemiL && u.uHemiI && u.uHemiSky && u.uHemignd) {
      (u.uHemiI as { value: number }).value = c.HEMI_LIGHT_INTENSITY;
      (u.uHemiSky as { value: Color }).value.copy(hemiL.color);
      (u.uHemignd as { value: Color }).value.copy(hemiL.groundColor);
    }

    const n = Math.min(8, pointSpillCount);
    if (u.uPCount) (u.uPCount as { value: number }).value = n;
    for (let i = 0; i < 8; i++) {
      const pU = u[`uPPos${i}` as 'uPPos0'];
      const cU = u[`uPCol${i}` as 'uPCol0'];
      if (pU && cU) {
        (pU as { value: Vector3 }).value.copy(pointSpillPos[i]!);
        (cU as { value: Color }).value.copy(pointSpillCol[i]!);
      }
    }
  }, 1);

  // Strands: stable draw order. Secondary strand draws after; pairs with
  // material polygon offset so one side wins at ambiguous depths.
  return (
    <mesh
      ref={meshRef}
      geometry={buffers.geometry}
      material={material}
      renderOrder={1 + strandId}
    />
  );
}
