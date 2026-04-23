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
  NoToneMapping,
  type ShaderMaterial,
  Vector3,
} from 'three';
import {
  BloomEffect,
  EffectPass,
  type EffectComposer as EffectComposerImpl,
} from 'postprocessing';
import { SOCKET_THEMES, THEMES, WIRE_THEMES, type Config } from '@melty/shared';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { BillboardBulbs } from './BillboardBulbs.tsx';
import { SnowField } from './SnowField.tsx';
import { bulbTLocations } from './utils.ts';
import { generateBasePoints } from './wire/basePoints.ts';
import { allocateRibbonBuffers, writeRibbonPositions } from './wire/buildRibbonGeometry.ts';
import { ribbonSegmentCount } from './wire/buildTubeGeometry.ts';
import { createWireMaterial } from './wire/createWireMaterial.ts';
import { TwistedCurve } from './wire/TwistedCurve.ts';
import { AlphaLift } from './effects/AlphaLift.tsx';

const BACKGROUND_COLOR = '#08111d';

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
  WIRE_TWISTS: number;
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
    WIRE_TWISTS: c.WIRE_TWISTS,
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
      camera={{
        far: 200,
        fov: 40,
        near: 0.1,
        // Seed position only — CameraPose takes over on mount and updates
        // the camera imperatively every frame, so changing CAMERA_* no
        // longer causes React to re-render this tree.
        position: [0, 1.8, 15],
      }}
      dpr={[1, 2]}
      gl={{
        alpha: true,
        antialias: structural.ANTIALIAS_ENABLED,
        premultipliedAlpha: false,
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
  const { gl } = useThree();

  // Keep renderer tone mapping in sync with the PostFX toggle. With PostFX on,
  // the composer applies tone mapping after Bloom has worked on linear HDR
  // values — so the renderer must stay in NoToneMapping to avoid mapping
  // twice (which collapsed the scene to near-black whenever the opaque
  // background was off). With PostFX off, the renderer itself handles it.
  useEffect(() => {
    gl.toneMapping = structural.POSTFX_ENABLED ? NoToneMapping : ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;
  }, [gl, structural.POSTFX_ENABLED]);

  const basePoints = useMemo(
    () => generateBasePoints(structural.NUM_PINS, structural.SAG_AMPLITUDE, structural.TENSION),
    [structural.NUM_PINS, structural.SAG_AMPLITUDE, structural.TENSION],
  );

  const baseCurve = useMemo(
    () => new CatmullRomCurve3(basePoints, false, 'centripetal'),
    [basePoints],
  );

  const locations = useMemo(
    () => bulbTLocations(structural.NUM_PINS, structural.LIGHTS_PER_SEGMENT),
    [structural.NUM_PINS, structural.LIGHTS_PER_SEGMENT],
  );

  const evenLocations = useMemo(
    () => locations.filter((_, index) => index % 2 === 0),
    [locations],
  );

  const oddLocations = useMemo(
    () => locations.filter((_, index) => index % 2 !== 0),
    [locations],
  );

  const wireA = useMemo(
    () => new TwistedCurve(
      baseCurve,
      structural.WIRE_SEPARATION,
      structural.WIRE_TWISTS,
      0,
      evenLocations,
      oddLocations,
      structural.BULB_SCALE,
      true,
    ),
    [
      baseCurve,
      structural.BULB_SCALE,
      structural.WIRE_SEPARATION,
      structural.WIRE_TWISTS,
      evenLocations,
      oddLocations,
    ],
  );

  const wireB = useMemo(
    () => new TwistedCurve(
      baseCurve,
      structural.WIRE_SEPARATION,
      structural.WIRE_TWISTS,
      Math.PI,
      oddLocations,
      evenLocations,
      structural.BULB_SCALE,
      true,
    ),
    [
      baseCurve,
      structural.BULB_SCALE,
      structural.WIRE_SEPARATION,
      structural.WIRE_TWISTS,
      evenLocations,
      oddLocations,
    ],
  );

  const bulbData = useMemo(() => (
    locations.map((t, index) => {
      const point = baseCurve.getPoint(t);
      const socketColorHex = structural.SOCKET_THEME === 'WIRE_MATCH'
        ? (index % 2 === 0 ? wireTheme.A : wireTheme.B)
        : (SOCKET_THEMES[structural.SOCKET_THEME] ?? wireTheme.A);

      return {
        baseColorHex: activeTheme.bulbs[index % activeTheme.bulbs.length]!,
        position: [point.x, point.y, point.z] as [number, number, number],
        socketColorHex,
      };
    })
  ), [activeTheme.bulbs, baseCurve, structural.SOCKET_THEME, locations, wireTheme.A, wireTheme.B]);

  const segmentCount = ribbonSegmentCount(structural.WIRE_TWISTS);

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
      bloom.intensity = c.BLOOM_STRENGTH * Math.max(0.35, c.BLOOM_INTENSITY);
      const lum = bloom.luminanceMaterial;
      if (lum?.uniforms?.threshold) {
        lum.uniforms.threshold.value = c.BLOOM_THRESHOLD;
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
      <directionalLight ref={keyLightRef} intensity={0} position={[0, 12, 12]} />
      <directionalLight ref={fillLightRef} intensity={0} position={[0, 4, -12]} />
      <hemisphereLight ref={hemiLightRef} args={['#eef5ff', '#0a0a12', 0]} />

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

      {/* Single luminance-threshold Bloom pass does the emissive halo work
          that a <SelectiveBloom> + <Selection> + 80 <pointLight>s would have
          done, without the "Maximum update depth" render loop that older
          combo caused. */}
      <group ref={swayGroupRef}>
        {/* Strand A and B are π out of phase, so the weave depth offset in
            the shader pushes them in opposite directions every half-twist
            and they actually cross over each other in screen space
            (instead of just alpha-overlapping as two flat ribbons). */}
        <WireRibbon
          color={wireTheme.A}
          curve={wireA}
          segments={segmentCount}
          twistPhase={0}
          strandId={0}
        />
        <WireRibbon
          color={wireTheme.B}
          curve={wireB}
          segments={segmentCount}
          twistPhase={Math.PI}
          strandId={1}
        />
        <BillboardBulbs
          bulbs={bulbData}
          themePalette={activeTheme.bulbs}
          pointLightsEnabled={structural.POINT_LIGHTS_ENABLED}
        />
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

// Fixed world-space look direction for the scene camera. Derived from the
// original default pose (eye (0,-3,15) → target (0,1.8,0)) so the initial
// framing matches what the user is used to: a gentle upward tilt toward the
// light string. Keeping this vector constant means every camera slider is
// pure translation — pan, height, and zoom never change the camera's
// orientation, so the scene can't "rotate on the Z axis" as you zoom.
const CAMERA_FORWARD = new Vector3(0, 4.8, -15).normalize();
const _cameraTarget = new Vector3();

function CameraPose() {
  const { camera } = useThree();

  // Update the camera imperatively every frame from the store. This makes
  // camera sliders zero-cost from a React standpoint: no re-render, no
  // reconciliation, just a matrix update on the next GL frame.
  useFrame(() => {
    const c = useConfigStore.getState().config;
    camera.position.set(c.CAMERA_X, c.CAMERA_HEIGHT, c.CAMERA_DISTANCE);
    _cameraTarget.copy(camera.position).addScaledVector(CAMERA_FORWARD, 10);
    camera.lookAt(_cameraTarget);
  });

  return null;
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
      <Bloom
        luminanceThreshold={0.6}
        mipmapBlur
        intensity={1}
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
  twistPhase,
  strandId,
}: {
  color: number;
  curve: TwistedCurve;
  segments: number;
  twistPhase: number;
  strandId: 0 | 1;
}) {
  const meshRef = useRef<Mesh>(null);
  const buffers = useMemo(() => allocateRibbonBuffers(segments), [segments]);
  const material = useMemo<ShaderMaterial>(
    () => createWireMaterial(color, twistPhase, strandId),
    [color, twistPhase, strandId],
  );

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

  // Imperative per-frame uniform sync. Every value we read here is either
  // continuous (WIRE_THICKNESS, AMBIENT_INTENSITY) or cheap to rewrite
  // every frame (uTwists). Doing this in useFrame instead of via React
  // props means dragging the wire sliders is zero-React-work.
  useFrame(() => {
    const c = useConfigStore.getState().config;
    const u = material.uniforms;
    if (u.uTwists) u.uTwists.value = c.WIRE_TWISTS;
    if (u.uAmbient) u.uAmbient.value = c.AMBIENT_INTENSITY;
    if (u.uThickness) u.uThickness.value = c.WIRE_THICKNESS;
    // Stronger physical separation at crossings when the cord is thick; keep
    // a floor so thin settings still break z-fights between the two strands.
    if (u.uWeaveDepth) {
      u.uWeaveDepth.value = Math.max(0.055, c.WIRE_THICKNESS * 2.25);
    }
  });

  return <mesh ref={meshRef} geometry={buffers.geometry} material={material} renderOrder={1} />;
}
