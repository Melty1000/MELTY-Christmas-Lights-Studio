import { Stars, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  EffectComposer,
  Select,
  Selection,
  SelectiveBloom,
  ToneMapping,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  CatmullRomCurve3,
  DoubleSide,
  Group,
  HalfFloatType,
  Mesh,
  NoToneMapping,
  Vector3,
} from 'three';
import { SOCKET_THEMES, THEMES, WIRE_THEMES, type Config } from '@melty/shared';
import { useConfigStore } from '~/stores/useConfigStore.ts';
import { BillboardBulbs } from './BillboardBulbs.tsx';
import { SnowField } from './SnowField.tsx';
import { bulbTLocations } from './utils.ts';
import { generateBasePoints } from './wire/basePoints.ts';
import { allocateRibbonBuffers, writeRibbonPositions } from './wire/buildRibbonGeometry.ts';
import { segmentCountForQuality } from './wire/buildTubeGeometry.ts';
import { TwistedCurve } from './wire/TwistedCurve.ts';
import { AlphaLift } from './effects/AlphaLift.tsx';

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
        // When PostFX is active, the composer does tone mapping via the
        // dedicated ToneMapping pass so we keep the base renderer in linear
        // space (NoToneMapping) to avoid double-mapping the HDR values that
        // feed into Bloom. The renderer's own tone mapping is only used when
        // PostFX is disabled, so we flip this in SceneContent as needed.
        gl.toneMapping = NoToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <SceneContent config={config} />
    </Canvas>
  );
}

function SceneContent({ config }: { config: Config }) {
  const activeTheme = THEMES[config.ACTIVE_THEME];
  const wireTheme = WIRE_THEMES[config.WIRE_THEME];
  const swayGroupRef = useRef<Group>(null);
  const { gl } = useThree();

  // Keep renderer tone mapping in sync with the PostFX toggle. With PostFX on,
  // the composer applies tone mapping after Bloom has worked on linear HDR
  // values — so the renderer must stay in NoToneMapping to avoid mapping
  // twice (which collapsed the scene to near-black whenever the opaque
  // background was off). With PostFX off, the renderer itself handles it.
  useEffect(() => {
    gl.toneMapping = config.POSTFX_ENABLED ? NoToneMapping : ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;
  }, [gl, config.POSTFX_ENABLED]);

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
      true,
    ),
    [
      baseCurve,
      config.BULB_SCALE,
      config.WIRE_SEPARATION,
      config.WIRE_TWISTS,
      evenLocations,
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
      true,
    ),
    [
      baseCurve,
      config.BULB_SCALE,
      config.WIRE_SEPARATION,
      config.WIRE_TWISTS,
      evenLocations,
      oddLocations,
    ],
  );

  const bulbData = useMemo(() => (
    locations.map((t, index) => {
      const point = baseCurve.getPoint(t);
      const socketColorHex = config.SOCKET_THEME === 'WIRE_MATCH'
        ? (index % 2 === 0 ? wireTheme.A : wireTheme.B)
        : (SOCKET_THEMES[config.SOCKET_THEME] ?? wireTheme.A);

      return {
        baseColorHex: activeTheme.bulbs[index % activeTheme.bulbs.length]!,
        position: [point.x, point.y, point.z] as [number, number, number],
        socketColorHex,
      };
    })
  ), [activeTheme.bulbs, baseCurve, config.SOCKET_THEME, locations, wireTheme.A, wireTheme.B]);

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
      <directionalLight intensity={config.KEY_LIGHT_INTENSITY} position={[0, 12, 12]} />
      <directionalLight intensity={config.FILL_LIGHT_INTENSITY} position={[0, 4, -12]} />
      <hemisphereLight args={['#eef5ff', '#0a0a12', config.HEMI_LIGHT_INTENSITY]} />

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

      {/* Selection wraps the scene + composer so <SelectiveBloom> can isolate
          bulb emissives from the wire. Without this, threshold-based bloom
          on a single composer reads the whole HDR scene and the lit wire
          (ambient + directional + hemi light contributions) sails past the
          threshold, producing the "whole scene glows / PostFX washes out"
          look that doesn't match the legacy's triple-scene bloom. */}
      <Selection>
        <group ref={swayGroupRef}>
          <WireRibbon
            color={wireTheme.A}
            curve={wireA}
            segments={segmentCount}
            thickness={config.WIRE_THICKNESS}
          />
          <WireRibbon
            color={wireTheme.B}
            curve={wireB}
            segments={segmentCount}
            thickness={config.WIRE_THICKNESS}
          />

          <Select enabled>
            <BillboardBulbs bulbs={bulbData} config={config} themePalette={activeTheme.bulbs} />
          </Select>
        </group>

        {config.POSTFX_ENABLED ? (
          <EffectComposer
            multisampling={config.ANTIALIAS_ENABLED ? 8 : 0}
            frameBufferType={HalfFloatType}
          >
            <SelectiveBloom
              luminanceThreshold={config.BLOOM_THRESHOLD}
              mipmapBlur
              intensity={config.BLOOM_STRENGTH * Math.max(0.35, config.BLOOM_INTENSITY)}
              radius={config.BLOOM_RADIUS}
            />
            {/*
              AGX tone mapping preserves hue at high intensity — ACES Filmic
              was collapsing saturated emissive bulbs (vColor * 6+) toward
              white and spreading that white through bloom.
            */}
            <ToneMapping mode={ToneMappingMode.AGX} />
            {/*
              AlphaLift: lift alpha to match final luminance so the bloom
              halo survives composition on a transparent canvas. Only needed
              when the opaque background is off. EffectComposer's children
              type doesn't accept `null`, so swap in an empty fragment.
            */}
            {!config.BACKGROUND_ENABLED ? <AlphaLift strength={1.0} /> : <></>}
          </EffectComposer>
        ) : null}
      </Selection>

      {config.STATS_ENABLED ? <Stats className="!left-4 !top-4" /> : null}
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

function CameraPose({ config }: { config: Config }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(config.CAMERA_X, config.CAMERA_HEIGHT, config.CAMERA_DISTANCE);
    _cameraTarget.copy(camera.position).addScaledVector(CAMERA_FORWARD, 10);
    camera.lookAt(_cameraTarget);
    camera.updateProjectionMatrix();
  }, [
    camera,
    config.CAMERA_DISTANCE,
    config.CAMERA_HEIGHT,
    config.CAMERA_X,
  ]);

  return null;
}

function WireRibbon({
  color,
  curve,
  segments,
  thickness,
}: {
  color: number;
  curve: TwistedCurve;
  segments: number;
  thickness: number;
}) {
  const meshRef = useRef<Mesh>(null);
  const colorValue = `#${color.toString(16).padStart(6, '0')}`;

  const buffers = useMemo(() => allocateRibbonBuffers(segments), [segments]);

  useEffect(() => {
    writeRibbonPositions(buffers, curve, thickness);
  }, [buffers, curve, thickness]);

  useEffect(() => {
    const geometry = buffers.geometry;
    return () => {
      geometry.dispose();
    };
  }, [buffers]);

  return (
    <mesh ref={meshRef} geometry={buffers.geometry} renderOrder={1}>
      <meshStandardMaterial
        color={colorValue}
        metalness={0.22}
        roughness={0.62}
        side={DoubleSide}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}
