import { Stars, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  type AmbientLight,
  CatmullRomCurve3,
  Group,
  HalfFloatType,
  type Mesh,
  type OrthographicCamera,
  NoToneMapping,
  type ShaderMaterial,
  Color,
  Vector3,
  type Curve,
  CubicBezierCurve3,
} from 'three';
import {
  DEFAULT_CONFIG,
  DEFAULT_WIRE_GEOMETRY,
  METAL_THEMES,
  SOCKET_THEMES,
  THEMES,
  WIRE_THEMES,
  resolveWireGeometry,
  type Config,
} from '@melty/shared';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { BillboardBulbs } from './BillboardBulbs.tsx';
import { SnowField } from './SnowField.tsx';
import { bulbTLocationsForSpans } from './utils.ts';
import { generateLightLayoutPaths, type LightLayoutPath } from './wire/basePoints.ts';
import {
  allocateBatchedRibbonBuffers,
  allocateRibbonBuffers,
  writeBatchedRibbonPositions,
  writeRibbonPositions,
} from './wire/buildRibbonGeometry.ts';
import { ribbonSegmentCount } from './wire/buildTubeGeometry.ts';
import { createWireMaterial } from './wire/createWireMaterial.ts';
import { sampleBulbGuide } from './wire/bulbGuide.ts';
import { POINT_SPILL_MAX, pointSpillCol, pointSpillCount, pointSpillPos } from './wire/pointSpillState.ts';
import { TwistedCurve } from './wire/TwistedCurve.ts';
import { SampledCurve } from './wire/SampledCurve.ts';
import { AlphaLift } from './effects/AlphaLift.tsx';
import { BulbHalo } from './effects/BulbHalo.tsx';
import {
  BILLBOARD_OFFSETS,
  ORTHO_CAMERA_DEPTH_DIRECTION,
  ORTHO_CAMERA_FORWARD,
  billboardDepthBoost,
  socketWireJoinDepth,
} from './bulbMetrics.ts';

const _bulbGuide = new Vector3();

interface BulbRecord {
  t: number;
  point: Vector3;
  directionVector: Vector3;
  direction: [number, number, number];
  baseColorHex: number;
  socketColorHex: number;
  strandId: 0 | 1;
}

interface SocketLeadDatum {
  curve: CubicBezierCurve3;
  color: number;
  strandId: 0 | 1;
}

interface SocketLeadGroup {
  color: number;
  strandId: 0 | 1;
  curves: CubicBezierCurve3[];
}

const BACKGROUND_COLOR = '#08111d';
const ORTHO_VIEW_HEIGHT = 18;
const ORTHO_BASE_DISTANCE = 22;
const ORTHO_CAMERA_DISTANCE = 100;
const ORTHO_SCREEN_Y_SCALE = Math.sqrt(1 - ORTHO_CAMERA_FORWARD.y * ORTHO_CAMERA_FORWARD.y);
const SOCKET_LEAD_SEGMENTS = 22;
const SOCKET_LEAD_THICKNESS_SCALE = 0.52;
const SOCKET_LEAD_T_SPAN_MAX = 0.018;
const SOCKET_LEAD_T_SPAN_FACTOR = 0.38;
const SOCKET_LEAD_SOCKET_HALF_WIDTH = 0.052;
const SOCKET_LEAD_SURFACE_EXIT_SCALE = 0.7;
const SOCKET_LEAD_BLOCKED_SURFACE_EXIT_MULTIPLIER = 0.18;
const SOCKET_LEAD_Z_CLEARANCE = 0.18;
const SOCKET_LEAD_SOCKET_Z_FRONT = 0.08;
const SOCKET_LEAD_START_EMBED_SCALE = 0.35;
const SOCKET_LEAD_START_TAPER = 0;
const SOCKET_LEAD_TAPER_MIN_SCALE = 1;
const DEBUG_FORCE_SOCKET_LEADS_WHITE = false;
const DEBUG_SOCKET_LEAD_COLOR = 0xffffff;
const _cameraTarget = new Vector3();
const _cameraEye = new Vector3();

// ---------------------------------------------------------------------------
// Structural vs. continuous config
// ---------------------------------------------------------------------------
//
// Before this split, `Scene` subscribed to the whole config object. Every
// slider tick produced a new config reference, which re-rendered Scene →
// Canvas -> every child under R3F, including the old real point-light list in
// BillboardBulbs. That's the reason dragging BULB_SCALE / internal glow /
// AMBIENT / CAMERA_* felt heavy: React was reconciling an entire 3D scene
// graph per pixel of drag.
//
// The fix is to subscribe only to *structural* fields — the ones that
// change mount/unmount, geometry topology, theme lookups, or feature
// toggles. Everything else (continuous intensities, camera position, sway,
// halo params, glass opacity) is read imperatively in
// useFrame via `useConfigStore.getState()`, so dragging those sliders just
// updates the next GL frame without any React work.
interface StructuralConfig {
  NUM_PINS: number;
  LIGHTS_PER_SEGMENT: number;
  SAG_AMPLITUDE: number;
  WIRE_SEPARATION: number;
  WIRE_THICKNESS: number;
  WIRE_TWISTS: number;
  WIRE_COLOR_OVERRIDE_ENABLED: boolean;
  WIRE_A_COLOR: number;
  WIRE_B_COLOR: number;
  WIRE_A_LEAD_COLOR: number;
  WIRE_B_LEAD_COLOR: number;
  BULB_ORIENTATION_MODE: Config['BULB_ORIENTATION_MODE'];
  LAYOUT_MODE: Config['LAYOUT_MODE'];
  LAYOUT_EDGES: Config['LAYOUT_EDGES'];
  LAYOUT_SHAPE_SIDES: Config['LAYOUT_SHAPE_SIDES'];
  LAYOUT_CORNER_ROUNDNESS: Config['LAYOUT_CORNER_ROUNDNESS'];
  LAYOUT_INSET: number;
  LAYOUT_SIZE: number;
  LAYOUT_POSITION_X: number;
  LAYOUT_POSITION_Y: number;
  WIRE_THEME: Config['WIRE_THEME'];
  SOCKET_THEME: Config['SOCKET_THEME'];
  ACTIVE_THEME: Config['ACTIVE_THEME'];
  BULB_SCALE: number;
  CAMERA_DISTANCE: number;
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

function layoutInsetForConfig(config: Config): number {
  switch (config.LAYOUT_MODE) {
    case 'SHAPE':
      return config.SHAPE_PADDING;
    case 'EDGES':
      return config.EDGE_INSET;
  }
}

function layoutSizeForConfig(config: Config): number {
  switch (config.LAYOUT_MODE) {
    case 'SHAPE':
      return 1;
    case 'EDGES':
      return config.EDGE_COVERAGE;
  }
}

function selectStructural(state: { config: Config }): StructuralConfig {
  const c = state.config;
  const wire = resolveWireGeometry(c);
  return {
    NUM_PINS: c.NUM_PINS,
    LIGHTS_PER_SEGMENT: c.LIGHTS_PER_SEGMENT,
    SAG_AMPLITUDE: c.SAG_AMPLITUDE,
    WIRE_SEPARATION: wire.WIRE_SEPARATION,
    WIRE_THICKNESS: wire.WIRE_THICKNESS,
    WIRE_TWISTS: wire.WIRE_TWISTS,
    WIRE_COLOR_OVERRIDE_ENABLED: c.WIRE_COLOR_OVERRIDE_ENABLED,
    WIRE_A_COLOR: c.WIRE_A_COLOR,
    WIRE_B_COLOR: c.WIRE_B_COLOR,
    WIRE_A_LEAD_COLOR: c.WIRE_A_LEAD_COLOR,
    WIRE_B_LEAD_COLOR: c.WIRE_B_LEAD_COLOR,
    BULB_ORIENTATION_MODE: c.BULB_ORIENTATION_MODE,
    LAYOUT_MODE: c.LAYOUT_MODE,
    LAYOUT_EDGES: c.LAYOUT_EDGES,
    LAYOUT_SHAPE_SIDES: c.LAYOUT_SHAPE_SIDES,
    LAYOUT_CORNER_ROUNDNESS: c.LAYOUT_CORNER_ROUNDNESS,
    LAYOUT_INSET: layoutInsetForConfig(c),
    LAYOUT_SIZE: layoutSizeForConfig(c),
    LAYOUT_POSITION_X: c.LAYOUT_POSITION_X,
    LAYOUT_POSITION_Y: c.LAYOUT_POSITION_Y,
    WIRE_THEME: c.WIRE_THEME,
    SOCKET_THEME: c.SOCKET_THEME,
    ACTIVE_THEME: c.ACTIVE_THEME,
    BULB_SCALE: c.BULB_SCALE,
    CAMERA_DISTANCE: c.CAMERA_DISTANCE,
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
  // Bulb scale intentionally lands here because wire dips/socket leads and
  // billboard bulb placement must all use the same attachment math.
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
  const baseWireTheme = WIRE_THEMES[structural.WIRE_THEME];
  const wireTheme = structural.WIRE_COLOR_OVERRIDE_ENABLED
    ? { A: structural.WIRE_A_COLOR, B: structural.WIRE_B_COLOR }
    : baseWireTheme;
  const leadTheme = structural.WIRE_COLOR_OVERRIDE_ENABLED
    ? { A: structural.WIRE_A_LEAD_COLOR, B: structural.WIRE_B_LEAD_COLOR }
    : wireTheme;
  const socketLeadTheme = DEBUG_FORCE_SOCKET_LEADS_WHITE
    ? { A: DEBUG_SOCKET_LEAD_COLOR, B: DEBUG_SOCKET_LEAD_COLOR }
    : leadTheme;
  const wireMetalness = !structural.WIRE_COLOR_OVERRIDE_ENABLED
    && (METAL_THEMES.WIRE as readonly string[]).includes(structural.WIRE_THEME)
    ? 1
    : 0;
  const socketMetalness = structural.SOCKET_THEME === 'WIRE_MATCH'
    ? wireMetalness
    : ((METAL_THEMES.SOCKET as readonly string[]).includes(structural.SOCKET_THEME) ? 1 : 0);
  const size = useThree((state) => state.size);
  const swayGroupRef = useRef<Group>(null);
  const ambientRef = useRef<AmbientLight>(null);
  const gl = useThree((state) => state.gl);

  // Keep the renderer in raw mode because the composer owns the final pass.
  // The composer stays mounted even when PostFX is toggled off; unmounting it
  // changes the live R3F render pipeline and can leave a transparent canvas
  // looking empty until a hard reset.
  useEffect(() => {
    gl.toneMapping = NoToneMapping;
    gl.toneMappingExposure = 1.2;
  }, [gl]);

  const layoutViewport = useMemo(() => {
    const aspect = size.height > 0 ? size.width / size.height : 16 / 9;
    return {
      width: ORTHO_VIEW_HEIGHT * aspect,
      height: ORTHO_VIEW_HEIGHT / ORTHO_SCREEN_Y_SCALE,
    };
  }, [size.height, size.width]);

  const layoutEdgesKey = structural.LAYOUT_EDGES.join('|');
  const layoutPaths = useMemo(
    () =>
      generateLightLayoutPaths({
        layoutMode: structural.LAYOUT_MODE,
        layoutEdges: structural.LAYOUT_EDGES,
        shapeSides: structural.LAYOUT_SHAPE_SIDES,
        cornerRoundness: structural.LAYOUT_CORNER_ROUNDNESS,
        viewport: layoutViewport,
        numPins: structural.NUM_PINS,
        sagAmplitude: structural.SAG_AMPLITUDE,
        margin: structural.LAYOUT_INSET,
        scale: structural.LAYOUT_SIZE,
        offsetX: structural.LAYOUT_POSITION_X,
        offsetY: structural.LAYOUT_POSITION_Y,
      }),
    [
      layoutViewport,
      layoutEdgesKey,
      structural.LAYOUT_CORNER_ROUNDNESS,
      structural.LAYOUT_MODE,
      structural.LAYOUT_SHAPE_SIDES,
      structural.LAYOUT_INSET,
      structural.LAYOUT_POSITION_X,
      structural.LAYOUT_POSITION_Y,
      structural.LAYOUT_SIZE,
      structural.NUM_PINS,
      structural.SAG_AMPLITUDE,
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
  });

  return (
    <>
      {structural.BACKGROUND_ENABLED ? (
        <color attach="background" args={[BACKGROUND_COLOR]} />
      ) : null}
      <CameraPose />

      <ambientLight ref={ambientRef} intensity={0} />

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

      {/* Bulbs render their glass normally; outside glow is drawn later by the
          isolated halo post effect from per-bulb emitter state. */}
      <group ref={swayGroupRef}>
        {layoutPaths.map((path, index) => (
          <LightString
            key={path.id}
            path={path}
            structural={structural}
            activeTheme={activeTheme}
            wireTheme={wireTheme}
            leadTheme={socketLeadTheme}
            wireMetalness={wireMetalness}
            socketMetalness={socketMetalness}
            resetPointSpill={index === 0}
          />
        ))}
      </group>

      <PostFX
        antialiased={structural.ANTIALIAS_ENABLED}
        backgroundEnabled={structural.BACKGROUND_ENABLED}
      />

      {structural.STATS_ENABLED ? <Stats className="!left-4 !top-4" /> : null}
    </>
  );
}

function LightString({
  path,
  structural,
  activeTheme,
  wireTheme,
  leadTheme,
  wireMetalness,
  socketMetalness,
  resetPointSpill,
}: {
  path: LightLayoutPath;
  structural: StructuralConfig;
  activeTheme: { bulbs: number[] };
  wireTheme: { A: number; B: number };
  leadTheme: { A: number; B: number };
  wireMetalness: number;
  socketMetalness: number;
  resetPointSpill: boolean;
}) {
  const baseCurve = useMemo(
    () => (
      path.curveMode === 'SAMPLED'
        ? new SampledCurve(path.points, path.closed ?? false)
        : new CatmullRomCurve3(path.points, path.closed ?? false, 'centripetal')
    ),
    [path],
  );

  const locations = useMemo(
    () => bulbTLocationsForSpans(path.spanCount, structural.LIGHTS_PER_SEGMENT),
    [path.spanCount, structural.LIGHTS_PER_SEGMENT],
  );

  const wireSeparation = structural.WIRE_SEPARATION;
  const wireTwists = structural.WIRE_TWISTS;
  const wireFrameMode = path.wireFrameMode ?? 'AUTO';
  const separationCompensation = Math.max(
    0,
    wireSeparation - DEFAULT_WIRE_GEOMETRY.WIRE_SEPARATION,
  );

  const bulbRecords = useMemo<BulbRecord[]>(() => (
    locations.map((t, index) => {
      const point = baseCurve.getPoint(t);
      const direction = computeBulbDirection(
        baseCurve,
        t,
        point,
        path.bulbTarget,
        path.bulbGuidePoints,
        structural.BULB_ORIENTATION_MODE,
        path.id,
        index,
      );
      const directionVector = new Vector3(direction[0], direction[1], direction[2]);
      const strandId = (index % 2 === 0 ? 0 : 1) as 0 | 1;
      const strandColorHex = strandId === 0 ? wireTheme.A : wireTheme.B;
      const socketColorHex = structural.SOCKET_THEME === 'WIRE_MATCH'
        ? strandColorHex
        : (SOCKET_THEMES[structural.SOCKET_THEME] ?? wireTheme.A);

      return {
        t,
        point,
        directionVector,
        direction,
        baseColorHex: activeTheme.bulbs[index % activeTheme.bulbs.length]!,
        socketColorHex,
        strandId,
      };
    })
  ), [
    activeTheme.bulbs,
    baseCurve,
    path.bulbGuidePoints,
    path.bulbTarget,
    path.id,
    structural.BULB_ORIENTATION_MODE,
    structural.SOCKET_THEME,
    locations,
    wireTheme.A,
    wireTheme.B,
  ]);

  const wireA = useMemo(
    () => new TwistedCurve(
      baseCurve,
      wireSeparation,
      wireTwists,
      0,
      wireFrameMode,
      path.closed ?? false,
    ),
    [
      baseCurve,
      wireTwists,
      wireSeparation,
      wireFrameMode,
    ],
  );

  const wireB = useMemo(
    () => new TwistedCurve(
      baseCurve,
      wireSeparation,
      wireTwists,
      Math.PI,
      wireFrameMode,
      path.closed ?? false,
    ),
    [
      baseCurve,
      wireTwists,
      wireSeparation,
      wireFrameMode,
    ],
  );

  const renderedBulbRecords = useMemo<BulbRecord[]>(() => {
    return bulbRecords.map((record) => {
      const assignedCurve = record.strandId === 0 ? wireA : wireB;
      return {
        ...record,
        point: assignedCurve.getPoint(record.t),
      };
    });
  }, [
    bulbRecords,
    wireA,
    wireB,
  ]);

  const socketLeads = useMemo<SocketLeadDatum[]>(() => {
    const joinDepth = socketWireJoinDepth(structural.BULB_SCALE, separationCompensation);
    const leadTSpan = Math.min(
      SOCKET_LEAD_T_SPAN_MAX,
      Math.max(0.004, SOCKET_LEAD_T_SPAN_FACTOR / Math.max(1, locations.length)),
    );
    const socketHalfWidth = SOCKET_LEAD_SOCKET_HALF_WIDTH * structural.BULB_SCALE;
    const tangentBend = Math.max(0.035, structural.BULB_SCALE * 0.08 + wireSeparation * 0.45);
    const socketBend = Math.max(0.04, structural.BULB_SCALE * 0.16);
    const surfaceExit = Math.max(0.004, structural.WIRE_THICKNESS * SOCKET_LEAD_SURFACE_EXIT_SCALE);
    const depthClearance = SOCKET_LEAD_Z_CLEARANCE * structural.BULB_SCALE;
    const socketDepthOffset = (
      BILLBOARD_OFFSETS.socket.z
      + billboardDepthBoost(structural.WIRE_THICKNESS, structural.CAMERA_DISTANCE)
      + SOCKET_LEAD_SOCKET_Z_FRONT * structural.BULB_SCALE
    );
    const leadRun = Math.min(
      Math.max(socketHalfWidth * 1.8, structural.BULB_SCALE * 0.32 + wireSeparation * 0.45),
      Math.max(socketHalfWidth * 1.6, baseCurve.getLength() * leadTSpan),
    );

    return renderedBulbRecords.flatMap((record) => {
      const assignedCurve = record.strandId === 0 ? wireA : wireB;
      const otherCurve = record.strandId === 0 ? wireB : wireA;
      const otherPoint = otherCurve.getPoint(record.t);
      const otherWireTowardBulb = otherPoint.sub(record.point).dot(record.directionVector) > 0;
      const contactSurfaceExit = otherWireTowardBulb
        ? surfaceExit * SOCKET_LEAD_BLOCKED_SURFACE_EXIT_MULTIPLIER
        : surfaceExit;
      const tangent = assignedCurve.getTangent(record.t).normalize();
      tangent.z = 0;
      if (tangent.lengthSq() < 0.000001) tangent.set(1, 0, 0);
      tangent.normalize();

      const leadSpecs = [
        {
          sideSign: -1,
          strandId: record.strandId,
          color: record.strandId === 0 ? leadTheme.A : leadTheme.B,
        },
        {
          sideSign: 1,
          strandId: record.strandId,
          color: record.strandId === 0 ? leadTheme.A : leadTheme.B,
        },
      ] as const;

      return leadSpecs.map(({ sideSign, strandId, color }) => {
        const start = record.point.clone()
          .addScaledVector(tangent, sideSign * leadRun)
          .addScaledVector(record.directionVector, contactSurfaceExit * SOCKET_LEAD_START_EMBED_SCALE);
        const end = record.point.clone()
          .addScaledVector(record.directionVector, joinDepth)
          .addScaledVector(tangent, sideSign * socketHalfWidth)
          .addScaledVector(ORTHO_CAMERA_DEPTH_DIRECTION, socketDepthOffset);

        const controlA = start.clone()
          .addScaledVector(tangent, -sideSign * tangentBend)
          .addScaledVector(ORTHO_CAMERA_DEPTH_DIRECTION, socketDepthOffset + depthClearance);
        const controlB = end.clone()
          .addScaledVector(record.directionVector, -socketBend)
          .addScaledVector(ORTHO_CAMERA_DEPTH_DIRECTION, depthClearance);

        return {
          curve: new CubicBezierCurve3(start, controlA, controlB, end),
          color,
          strandId,
        };
      });
    });
  }, [
    locations.length,
    baseCurve,
    renderedBulbRecords,
    separationCompensation,
    structural.BULB_SCALE,
    structural.CAMERA_DISTANCE,
    structural.WIRE_THICKNESS,
    wireSeparation,
    wireA,
    wireB,
    leadTheme.A,
    leadTheme.B,
  ]);

  const bulbData = useMemo(() => (
    renderedBulbRecords.map((record) => ({
      baseColorHex: record.baseColorHex,
      position: [record.point.x, record.point.y, record.point.z] as [number, number, number],
      direction: record.direction,
      socketColorHex: record.socketColorHex,
    }))
  ), [renderedBulbRecords]);

  const socketLeadGroups = useMemo<SocketLeadGroup[]>(() => {
    const groups = new Map<string, SocketLeadGroup>();
    for (const lead of socketLeads) {
      const key = `${lead.strandId}:${lead.color}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          color: lead.color,
          strandId: lead.strandId,
          curves: [],
        };
        groups.set(key, group);
      }
      group.curves.push(lead.curve);
    }
    return Array.from(groups.values());
  }, [socketLeads]);

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
        exactColorMode={structural.WIRE_COLOR_OVERRIDE_ENABLED}
        metalness={wireMetalness}
      />
      <WireRibbon
        color={wireTheme.B}
        curve={wireB}
        segments={segmentCount}
        effectiveTwists={wireTwists}
        twistPhase={Math.PI}
        strandId={1}
        exactColorMode={structural.WIRE_COLOR_OVERRIDE_ENABLED}
        metalness={wireMetalness}
      />
      {socketLeadGroups.map((group) => (
        <BatchedWireRibbon
          key={`socket-lead-group-${path.id}-${group.strandId}-${group.color}`}
          color={group.color}
          curves={group.curves}
          segments={SOCKET_LEAD_SEGMENTS}
          effectiveTwists={0}
          twistPhase={0}
          strandId={group.strandId}
          thicknessScale={SOCKET_LEAD_THICKNESS_SCALE}
          renderOrder={3}
          exactColorMode={structural.WIRE_COLOR_OVERRIDE_ENABLED}
          startTaper={SOCKET_LEAD_START_TAPER}
          taperMinScale={SOCKET_LEAD_TAPER_MIN_SCALE}
          metalness={wireMetalness}
          enablePointSpill
        />
      ))}
      <BillboardBulbs
        bulbs={bulbData}
        themePalette={activeTheme.bulbs}
        bulbScale={structural.BULB_SCALE}
        separationCompensation={separationCompensation}
        resetPointSpill={resetPointSpill}
        exactSocketColorMode={structural.WIRE_COLOR_OVERRIDE_ENABLED}
        socketMetalness={socketMetalness}
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
    _cameraEye.copy(_cameraTarget).addScaledVector(ORTHO_CAMERA_FORWARD, -ORTHO_CAMERA_DISTANCE);
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

function computeBulbDirection(
  curve: Curve<Vector3>,
  t: number,
  point: Vector3,
  target: Vector3,
  guidePoints?: Vector3[],
  mode: Config['BULB_ORIENTATION_MODE'] = 'LAYOUT',
  _pathId = 'path',
  bulbIndex = 0,
): [number, number, number] {
  const tangent = curve.getTangent(t).normalize();
  let x = -tangent.y;
  let y = tangent.x;

  if (mode === 'NATURAL') {
    if (bulbIndex % 2 !== 0) {
      x = -x;
      y = -y;
    }
  } else {
    const guide = sampleBulbGuide(t, point, target, guidePoints, _bulbGuide);
    if ((x * guide.x) + (y * guide.y) < 0) {
      x = -x;
      y = -y;
    }
  }

  const length = Math.hypot(x, y);
  if (length < 0.0001) return [0, -1, 0];
  return [x / length, y / length, 0];
}

function updateWireRibbonMaterial({
  material,
  config,
  displayThickness,
  thicknessScale,
  effectiveTwists,
  exactColorMode,
  startTaper,
  endTaper,
  taperMinScale,
  metalness,
  enablePointSpill,
}: {
  material: ShaderMaterial;
  config: Config;
  displayThickness: number;
  thicknessScale: number;
  effectiveTwists: number;
  exactColorMode: boolean;
  startTaper: number;
  endTaper: number;
  taperMinScale: number;
  metalness: number;
  enablePointSpill: boolean;
}) {
  const u = material.uniforms;
  if (u.uTwists) u.uTwists.value = effectiveTwists;
  if (u.uAmbient) u.uAmbient.value = config.AMBIENT_INTENSITY;
  if (u.uFrontShadowStrength) u.uFrontShadowStrength.value = effectiveTwists <= 0 ? 0 : 0.2;
  if (u.uColorFloor) u.uColorFloor.value = metalness > 0 ? 0.2 : 0.16;
  if (u.uExactColorMode) u.uExactColorMode.value = exactColorMode ? 1 : 0;
  if (u.uStartTaper) u.uStartTaper.value = startTaper;
  if (u.uEndTaper) u.uEndTaper.value = endTaper;
  if (u.uTaperMinScale) u.uTaperMinScale.value = taperMinScale;
  if (u.uMetalness) u.uMetalness.value = metalness;
  if (u.uThickness) u.uThickness.value = displayThickness;
  if (u.uWeaveDepth) {
    u.uWeaveDepth.value = Math.max(0.05 * thicknessScale, displayThickness * 1.85);
  }
  if (u.uCollisionSpread) {
    u.uCollisionSpread.value = Math.max(0.002 * thicknessScale, displayThickness * 0.12);
  }
  material.polygonOffsetFactor = 0;
  material.polygonOffsetUnits = 0;

  if (enablePointSpill) {
    const n = Math.min(POINT_SPILL_MAX, pointSpillCount);
    if (u.uPCount) (u.uPCount as { value: number }).value = n;
    const pointPositions = u.uPPos as { value: Vector3[] } | undefined;
    const pointColors = u.uPCol as { value: Color[] } | undefined;
    for (let i = 0; i < POINT_SPILL_MAX; i++) {
      const pointPosition = pointPositions?.value[i];
      const pointColor = pointColors?.value[i];
      if (pointPosition && pointColor) {
        pointPosition.copy(pointSpillPos[i]!);
        pointColor.copy(pointSpillCol[i]!);
      }
    }
  }
}

function PostFX({
  antialiased,
  backgroundEnabled,
}: {
  antialiased: boolean;
  backgroundEnabled: boolean;
}) {
  return (
    <EffectComposer multisampling={antialiased ? 8 : 0} frameBufferType={HalfFloatType}>
      <BulbHalo />
      <AlphaLift strength={1} opaqueFloor={backgroundEnabled ? 1 : 0} />
    </EffectComposer>
  );
}

function BatchedWireRibbon({
  color,
  curves,
  segments,
  effectiveTwists,
  twistPhase,
  strandId,
  thicknessScale = 1,
  renderOrder,
  exactColorMode = false,
  startTaper = 0,
  endTaper = 0,
  taperMinScale = 1,
  metalness = 0,
  enablePointSpill = false,
}: {
  color: number;
  curves: Curve<Vector3>[];
  segments: number;
  effectiveTwists: number;
  twistPhase: number;
  strandId: 0 | 1;
  thicknessScale?: number;
  renderOrder?: number;
  exactColorMode?: boolean;
  startTaper?: number;
  endTaper?: number;
  taperMinScale?: number;
  metalness?: number;
  enablePointSpill?: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const buffers = useMemo(
    () => allocateBatchedRibbonBuffers(curves.length, segments),
    [curves.length, segments],
  );
  const material = useMemo<ShaderMaterial>(
    () => createWireMaterial(color, twistPhase, strandId, { pointSpill: enablePointSpill }),
    [color, twistPhase, strandId, enablePointSpill],
  );

  useEffect(() => {
    if (curves.length > 0) writeBatchedRibbonPositions(buffers, curves);
  }, [buffers, curves]);

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

  useFrame(() => {
    const c = useConfigStore.getState().config;
    const wire = resolveWireGeometry(c);
    updateWireRibbonMaterial({
      material,
      config: c,
      displayThickness: wire.WIRE_THICKNESS * thicknessScale,
      thicknessScale,
      effectiveTwists,
      exactColorMode,
      startTaper,
      endTaper,
      taperMinScale,
      metalness,
      enablePointSpill,
    });
  }, 1);

  if (curves.length === 0) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={buffers.geometry}
      material={material}
      renderOrder={renderOrder ?? 1 + strandId}
    />
  );
}

function WireRibbon({
  color,
  curve,
  segments,
  effectiveTwists,
  twistPhase,
  strandId,
  thicknessScale = 1,
  renderOrder,
  exactColorMode = false,
  startTaper = 0,
  endTaper = 0,
  taperMinScale = 1,
  metalness = 0,
  enablePointSpill = true,
}: {
  color: number;
  curve: Curve<Vector3>;
  segments: number;
  effectiveTwists: number;
  twistPhase: number;
  strandId: 0 | 1;
  thicknessScale?: number;
  renderOrder?: number;
  exactColorMode?: boolean;
  startTaper?: number;
  endTaper?: number;
  taperMinScale?: number;
  metalness?: number;
  enablePointSpill?: boolean;
}) {
  const meshRef = useRef<Mesh>(null);
  const buffers = useMemo(() => allocateRibbonBuffers(segments), [segments]);
  const material = useMemo<ShaderMaterial>(
    () => createWireMaterial(color, twistPhase, strandId, { pointSpill: enablePointSpill }),
    [color, twistPhase, strandId, enablePointSpill],
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

  // priority 1: run after default (0) so virtual bulb spill emitters are
  // written to pointSpillState before we read them for the reflection term.
  useFrame(() => {
    const c = useConfigStore.getState().config;
    const tW = resolveWireGeometry(c).WIRE_THICKNESS;
    const displayThickness = tW * thicknessScale;

    updateWireRibbonMaterial({
      material,
      config: c,
      displayThickness,
      thicknessScale,
      effectiveTwists,
      exactColorMode,
      startTaper,
      endTaper,
      taperMinScale,
      metalness,
      enablePointSpill,
    });
  }, 1);

  // Strands: stable draw order. Secondary strand draws after; pairs with
  // material polygon offset so one side wins at ambiguous depths.
  return (
    <mesh
      ref={meshRef}
      geometry={buffers.geometry}
      material={material}
      renderOrder={renderOrder ?? 1 + strandId}
    />
  );
}
