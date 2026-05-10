import {
  DEFAULT_CONFIG,
  configSchema,
  maxSimpleWireTwistsForWeight,
  resolveWireGeometry,
} from './config.js';
import {
  SLIDER_CONTROL_IDS,
  USER_SLIDER_MAX,
  USER_SLIDER_MIN,
  USER_SLIDER_STEP,
  sliderDisplayValue,
  sliderPatchFromDisplay,
} from './sliderControls.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(USER_SLIDER_MIN, 0, 'user slider min is 0');
assertEqual(USER_SLIDER_MAX, 100, 'user slider max is 100');
assertEqual(USER_SLIDER_STEP, 1, 'user slider step is 1');

for (const id of SLIDER_CONTROL_IDS) {
  const value = sliderDisplayValue(id, DEFAULT_CONFIG);
  assert(Number.isInteger(value), `${id} display value should be an integer`);
  assert(value >= USER_SLIDER_MIN, `${id} display value should stay above slider min`);
  assert(value <= USER_SLIDER_MAX, `${id} display value should stay below slider max`);

  for (const display of [USER_SLIDER_MIN, 50, USER_SLIDER_MAX]) {
    const patch = sliderPatchFromDisplay(id, display, DEFAULT_CONFIG);
    const parsed = configSchema.parse({ ...DEFAULT_CONFIG, ...patch });
    const nextDisplay = sliderDisplayValue(id, parsed);
    assert(Number.isInteger(nextDisplay), `${id} round-trip display should be an integer`);
    assert(nextDisplay >= USER_SLIDER_MIN, `${id} round-trip should stay above slider min`);
    assert(nextDisplay <= USER_SLIDER_MAX, `${id} round-trip should stay below slider max`);
  }

  const belowMin = configSchema.parse({
    ...DEFAULT_CONFIG,
    ...sliderPatchFromDisplay(id, USER_SLIDER_MIN - 20, DEFAULT_CONFIG),
  });
  const aboveMax = configSchema.parse({
    ...DEFAULT_CONFIG,
    ...sliderPatchFromDisplay(id, USER_SLIDER_MAX + 20, DEFAULT_CONFIG),
  });
  assertEqual(sliderDisplayValue(id, belowMin), USER_SLIDER_MIN, `${id} display below min clamps to 0`);
  assertEqual(sliderDisplayValue(id, aboveMax), USER_SLIDER_MAX, `${id} display above max clamps to 100`);
}

for (const id of ['LAYOUT_POSITION_X', 'LAYOUT_POSITION_Y', 'CAMERA_HEIGHT', 'CAMERA_X', 'SNOW_DRIFT'] as const) {
  const patch = sliderPatchFromDisplay(id, 50, DEFAULT_CONFIG);
  const value = Object.values(patch)[0];
  assertEqual(value, 0, `${id} display midpoint should map to neutral zero`);
}

for (const id of ['LIGHTS_PER_SEGMENT', 'SNOW_COUNT', 'STARS_COUNT'] as const) {
  const patch = sliderPatchFromDisplay(id, 37, DEFAULT_CONFIG);
  const value = Object.values(patch)[0];
  assert(Number.isInteger(value), `${id} patch value should stay integer`);
}

assertEqual(sliderPatchFromDisplay('SPANS', 0, DEFAULT_CONFIG).NUM_PINS, 2, 'spans min maps to two pins');
assertEqual(sliderPatchFromDisplay('SPANS', 100, DEFAULT_CONFIG).NUM_PINS, 20, 'spans max maps to twenty pins');
assertEqual(sliderPatchFromDisplay('WIRE_WEIGHT', 100, DEFAULT_CONFIG).WIRE_WEIGHT, 50, 'wire weight UI 100 maps to internal 50');
assertEqual(sliderPatchFromDisplay('WIRE_WEIGHT', 98, DEFAULT_CONFIG).WIRE_WEIGHT, 49, 'wire weight UI 98 maps to internal 49');
assertEqual(
  configSchema.parse({ ...DEFAULT_CONFIG, LAYOUT_CORNER_ROUNDNESS: 0.004 }).LAYOUT_CORNER_ROUNDNESS,
  0,
  'sub-percent corner roundness snaps to the displayed zero value',
);
assertEqual(
  configSchema.parse({ ...DEFAULT_CONFIG, LAYOUT_CORNER_ROUNDNESS: 0.005 }).LAYOUT_CORNER_ROUNDNESS,
  0.01,
  'corner roundness snaps to the displayed one-percent grid',
);

const maxWeightConfig = {
  ...DEFAULT_CONFIG,
  WIRE_TUNING_MODE: 'SIMPLE' as const,
  WIRE_WEIGHT: 50,
  TWIST_DENSITY: 100,
};
const halfDensityConfig = {
  ...maxWeightConfig,
  TWIST_DENSITY: 50,
};
assertEqual(
  resolveWireGeometry(maxWeightConfig).WIRE_TWISTS,
  maxSimpleWireTwistsForWeight(50),
  'twist density UI 100 reaches the usable twist ceiling for the current wire weight',
);
assert(
  resolveWireGeometry(halfDensityConfig).WIRE_TWISTS < resolveWireGeometry(maxWeightConfig).WIRE_TWISTS,
  'twist density UI 50 remains visually distinct from UI 100',
);

assertEqual(sliderPatchFromDisplay('HALO_RADIUS', -20, DEFAULT_CONFIG).HALO_RADIUS, 0, 'display below min clamps to raw min');
assertEqual(sliderPatchFromDisplay('HALO_RADIUS', 120, DEFAULT_CONFIG).HALO_RADIUS, 0.3, 'display above max clamps to raw max');
