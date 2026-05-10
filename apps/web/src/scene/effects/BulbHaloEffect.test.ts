import {
  bulbHaloContributionForTest,
  socketHaloContinuityForTest,
} from './BulbHaloEffect.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const neckCenterContinuity = socketHaloContinuityForTest(0, 0);
assert(
  neckCenterContinuity >= 0.16,
  `halo should keep visible continuity at the socket neck, got ${neckCenterContinuity}`,
);

const justBehindSocketContinuity = socketHaloContinuityForTest(-0.04, 0);
assert(
  justBehindSocketContinuity >= 0.1,
  `halo should fade softly behind the socket instead of clipping, got ${justBehindSocketContinuity}`,
);

const bulbBodyContinuity = socketHaloContinuityForTest(0.35, 0);
assert(
  bulbBodyContinuity > neckCenterContinuity,
  'halo continuity should still strengthen across the visible bulb body',
);

const fullAuraOutsideGlass = bulbHaloContributionForTest({
  aura: 1,
  insideBulb: 0,
  edgeAlpha: 0,
  alongMask: 0.45,
});
const fullAuraThroughGlass = bulbHaloContributionForTest({
  aura: 1,
  insideBulb: 1,
  edgeAlpha: 0,
  alongMask: 0.45,
});

assert(
  fullAuraThroughGlass >= fullAuraOutsideGlass * 0.22,
  `halo should wrap through the glass body instead of being punched out, got ${fullAuraThroughGlass}`,
);
