import { generateLightLayoutPaths } from './basePoints.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const viewport = { width: 24.72, height: 18.9 };
const paths = generateLightLayoutPaths({
  layoutMode: 'EDGES',
  layoutEdges: ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'],
  shapeSides: 4,
  cornerRoundness: 1,
  viewport,
  numPins: 4,
  sagAmplitude: 0,
  margin: 0.105,
  scale: 1.24,
  offsetX: 0,
  offsetY: 0,
});

const points = paths.flatMap((path) => path.points);
const maxX = Math.max(...points.map((point) => point.x));
const minX = Math.min(...points.map((point) => point.x));
const maxY = Math.max(...points.map((point) => point.y));
const minY = Math.min(...points.map((point) => point.y));
const safeInset = Math.min(viewport.width, viewport.height) * 0.04;

assert(maxX <= viewport.width / 2 - safeInset, `right edge should leave glow room, got ${maxX}`);
assert(minX >= -viewport.width / 2 + safeInset, `left edge should leave glow room, got ${minX}`);
assert(maxY <= viewport.height / 2 - safeInset, `top edge should leave glow room, got ${maxY}`);
assert(minY >= -viewport.height / 2 + safeInset, `bottom edge should leave glow room, got ${minY}`);

const zeroInsetPaths = generateLightLayoutPaths({
  layoutMode: 'EDGES',
  layoutEdges: ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'],
  shapeSides: 4,
  cornerRoundness: 1,
  viewport,
  numPins: 4,
  sagAmplitude: 0,
  margin: 0,
  scale: 1.24,
  offsetX: 0,
  offsetY: 0,
});

const zeroInsetPoints = zeroInsetPaths.flatMap((path) => path.points);
const zeroInsetMaxX = Math.max(...zeroInsetPoints.map((point) => point.x));
const zeroInsetMinX = Math.min(...zeroInsetPoints.map((point) => point.x));
const zeroInsetMaxY = Math.max(...zeroInsetPoints.map((point) => point.y));
const zeroInsetMinY = Math.min(...zeroInsetPoints.map((point) => point.y));
const zeroInsetTolerance = Math.min(viewport.width, viewport.height) * 0.035;

assert(
  zeroInsetMaxX >= viewport.width / 2 - zeroInsetTolerance,
  `zero edge inset should stay close to the right edge, got ${zeroInsetMaxX}`,
);
assert(
  zeroInsetMinX <= -viewport.width / 2 + zeroInsetTolerance,
  `zero edge inset should stay close to the left edge, got ${zeroInsetMinX}`,
);
assert(
  zeroInsetMaxY >= viewport.height / 2 - zeroInsetTolerance,
  `zero edge inset should stay close to the top edge, got ${zeroInsetMaxY}`,
);
assert(
  zeroInsetMinY <= -viewport.height / 2 + zeroInsetTolerance,
  `zero edge inset should stay close to the bottom edge, got ${zeroInsetMinY}`,
);
