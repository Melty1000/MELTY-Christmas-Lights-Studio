import { Billboard, Stars, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  CatmullRomCurve3,
  Group,
} from 'three';
import { SOCKET_THEMES, THEMES, WIRE_THEMES, type Config } from '@melty/shared';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { BillboardBulbs } from './BillboardBulbs.tsx';
import { Bulb } from './Bulb.tsx';
import { SnowField } from './SnowField.tsx';
import { bulbTLocations } from './utils.ts';
import { generateBasePoints } from './wire/basePoints.ts';
import { segmentCountForQuality } from './wire/buildTubeGeometry.ts';
import { TwistedCurve } from './wire/TwistedCurve.ts';

const BACKGROUND_COLOR = '#08111d';

export function Scene() {
  const config = useConfigStore((state) => state.config);

  return (
    <Canvas
      key={`scene-${config.ANTIALIAS_ENABLED ? 'aa' : 'noaa'}-${config.QUALITY}`}
      camera={{
        far: 200,
        fov: 40,
        near: 0.1,
        position: [config.CAMERA_X, config.CAMERA_HEIGHT, config.CAMERA_DISTANCE],
      }}
      dpr={[1, 2]}
      gl={{
        alpha: true,
        antialias: config.ANTIALIAS_ENABLED,
        premultipliedAlpha: false,
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <SceneContent config={config} />
    </Canvas>
  );
}

function SceneContent({ config }: { config: Config }) {
  const isBillboardQuality = config.QUALITY === 'billboard';
  const activeTheme = THEMES[config.ACTIVE_THEME];
  const wireTheme = WIRE_THEMES[config.WIRE_THEME];
  const swayGroupRef = useRef<Group>(null);

  const basePoints = useMemo(
    () => generateBasePoints(config.NUM_PINS, config.SAG_AMPLITUDE, config.TENSION),
    [config.NUM_PINS, config.SAG_AMPLITUDE, config.TENSION],
  );

  const baseCurve = useMemo(
    () => new CatmullRomCurve3(basePoints, false, 'centripetal'),
    [basePoints],
  );

  const locations = useMemo(
    () => bulbTLocations(config.NUM_PINS, config.LIGHTS_PER_SEGMENT),
    [config.NUM_PINS, config.LIGHTS_PER_SEGMENT],
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
      config.WIRE_SEPARATION,
      config.WIRE_TWISTS,
      0,
      evenLocations,
      oddLocations,
      config.BULB_SCALE,
      isBillboardQuality,
    ),
    [
      baseCurve,
      config.BULB_SCALE,
      config.WIRE_SEPARATION,
      config.WIRE_TWISTS,
      evenLocations,
      isBillboardQuality,
      oddLocations,
    ],
  );

  const wireB = useMemo(
    () => new TwistedCurve(
      baseCurve,
      config.WIRE_SEPARATION,
      config.WIRE_TWISTS,
      Math.PI,
      oddLocations,
      evenLocations,
      config.BULB_SCALE,
      isBillboardQuality,
    ),
    [
      baseCurve,
      config.BULB_SCALE,
      config.WIRE_SEPARATION,
      config.WIRE_TWISTS,
      evenLocations,
      isBillboardQuality,
      oddLocations,
    ],
  );

  const bulbData = useMemo(() => (
    locations.map((t, index) => {
      const attachedCurve = index % 2 === 0 ? wireA : wireB;
      const point = isBillboardQuality
        ? baseCurve.getPoint(t)
        : attachedCurve.getPoint(t);
      const socketColorHex = config.SOCKET_THEME === 'WIRE_MATCH'
        ? (index % 2 === 0 ? wireTheme.A : wireTheme.B)
        : (SOCKET_THEMES[config.SOCKET_THEME] ?? wireTheme.A);

      return {
        baseColorHex: activeTheme.bulbs[index % activeTheme.bulbs.length]!,
        position: [point.x, point.y, point.z] as [number, number, number],
        socketColorHex,
      };
    })
  ), [activeTheme.bulbs, baseCurve, config.SOCKET_THEME, isBillboardQuality, locations, wireA, wireB, wireTheme.A, wireTheme.B]);

  const radialSegments = isBillboardQuality
    ? (config.BILLBOARD_DEBUG_HIGH_WIRE ? 5 : 2)
    : 8;
  const segmentCount = segmentCountForQuality(config.QUALITY, config.WIRE_TWISTS);

  useFrame(({ clock }) => {
    const group = swayGroupRef.current;
    if (!group) return;

    const elapsed = clock.getElapsedTime();
    group.position.x = Math.sin(elapsed * 0.65) * config.SWAY_X * 0.18;
    group.position.z = Math.cos(elapsed * 0.45) * config.SWAY_Z * 0.16;
  });

  return (
    <>
      {config.BACKGROUND_ENABLED ? <color attach="background" args={[BACKGROUND_COLOR]} /> : null}
      <CameraPose config={config} />

      <ambientLight intensity={config.AMBIENT_INTENSITY} />
      <directionalLight intensity={1.2} position={[0, 12, 12]} />
      <directionalLight intensity={0.42} position={[0, 4, -12]} />
      <hemisphereLight args={['#eef5ff', '#0a0a12', 0.35]} />

      {config.STARS_ENABLED ? (
        <Stars
          count={config.STARS_COUNT}
          depth={22}
          fade
          factor={Math.max(0.3, config.STARS_SIZE * 5)}
          radius={38}
          saturation={0}
          speed={config.STARS_TWINKLE_SPEED}
        />
      ) : null}

      {config.SNOW_ENABLED ? (
        <SnowField
          count={config.SNOW_COUNT}
          speed={config.SNOW_SPEED}
          size={config.SNOW_SIZE}
          drift={config.SNOW_DRIFT}
        />
      ) : null}

      <group ref={swayGroupRef}>
        <WireMesh
          color={wireTheme.A}
          curve={wireA}
          radialSegments={radialSegments}
          segments={segmentCount}
          thickness={config.WIRE_THICKNESS}
          transparent={isBillboardQuality}
        />
        <WireMesh
          color={wireTheme.B}
          curve={wireB}
          radialSegments={radialSegments}
          segments={segmentCount}
          thickness={config.WIRE_THICKNESS}
          transparent={isBillboardQuality}
        />

        {isBillboardQuality ? (
          <BillboardBulbs bulbs={bulbData} config={config} themePalette={activeTheme.bulbs} />
        ) : (
          bulbData.map((bulb, index) => (
            <Bulb
              key={`${index}-${bulb.baseColorHex}-${bulb.position.join(':')}`}
              baseColorHex={bulb.baseColorHex}
              config={config}
              index={index}
              position={bulb.position}
              scale={config.BULB_SCALE}
              socketColorHex={bulb.socketColorHex}
              themePalette={activeTheme.bulbs}
              total={bulbData.length}
            />
          ))
        )}
      </group>

      {config.POSTFX_ENABLED ? (
        <EffectComposer multisampling={0}>
          <Bloom
            luminanceThreshold={config.BLOOM_THRESHOLD}
            mipmapBlur
            intensity={config.BLOOM_STRENGTH * Math.max(0.35, config.BLOOM_INTENSITY)}
            radius={config.BLOOM_RADIUS}
          />
        </EffectComposer>
      ) : null}

      {config.STATS_ENABLED ? <Stats className="!left-4 !top-4" /> : null}
    </>
  );
}

function CameraPose({ config }: { config: Config }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(config.CAMERA_X, config.CAMERA_HEIGHT, config.CAMERA_DISTANCE);
    camera.lookAt(config.CAMERA_X * 0.1, 1.8, 0);
    camera.updateProjectionMatrix();
  }, [
    camera,
    config.CAMERA_DISTANCE,
    config.CAMERA_HEIGHT,
    config.CAMERA_X,
  ]);

  return null;
}

function WireMesh({
  color,
  curve,
  radialSegments,
  segments,
  thickness,
  transparent,
}: {
  color: number;
  curve: TwistedCurve;
  radialSegments: number;
  segments: number;
  thickness: number;
  transparent: boolean;
}) {
  const colorValue = `#${color.toString(16).padStart(6, '0')}`;

  return (
    <mesh renderOrder={transparent ? 1 : 0}>
      <tubeGeometry args={[curve, segments, thickness, radialSegments, false]} />
      <meshStandardMaterial
        color={colorValue}
        metalness={transparent ? 0.22 : 0.4}
        roughness={transparent ? 0.62 : 0.38}
        transparent={transparent}
        opacity={transparent ? 0.92 : 1}
      />
    </mesh>
  );
}
