import { Vector3 } from 'three';
import { normalizeLayoutEdges, type Config, type LayoutEdgeName } from '@melty/shared';

export interface LightLayoutViewport {
  width: number;
  height: number;
}

export interface LightLayoutPath {
  id: string;
  points: Vector3[];
  bulbGuidePoints?: Vector3[];
  spanCount: number;
  closed?: boolean;
  curveMode?: 'SAMPLED';
  wireFrameMode?: 'PLANAR';
  bulbDirectionY: -1 | 1;
  bulbTarget: Vector3;
}

interface GenerateLightLayoutPathsOptions {
  layoutMode: Config['LAYOUT_MODE'];
  layoutEdges: Config['LAYOUT_EDGES'];
  shapeSides: Config['LAYOUT_SHAPE_SIDES'];
  cornerRoundness: Config['LAYOUT_CORNER_ROUNDNESS'];
  viewport: LightLayoutViewport;
  numPins: number;
  sagAmplitude: number;
  margin: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface LayoutBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  edgeInset: number;
}

interface SegmentSpec {
  from: Vector3;
  to: Vector3;
  sagDir: Vector3;
}

interface SegmentTrim {
  trimStart: boolean;
  trimEnd: boolean;
}

const SEGMENT_STEPS = 12;
const EDGE_CORNER_STEPS = 18;
const EDGE_INSET_FRACTION = 0.02;
const EDGE_HALO_SAFE_INSET_FRACTION = 0.045;
const EDGE_MAX_CORNER_RADIUS_FRACTION = 0.28;
const CORNER_ROUNDNESS_DISPLAY_EPSILON = 0.005;
const SHAPE_SAMPLES_PER_SIDE = 24;
const SHAPE_MIN_SAMPLES = 96;
const SHAPE_CORNER_STEPS = 24;
const POINT_EPSILON = 0.000001;
const LAYOUT_PERIMETER_ORDER: readonly LayoutEdgeName[] = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'];
const _lerpA = new Vector3();
const _lerpB = new Vector3();
const _point = new Vector3();

export function generateLightLayoutPaths({
  layoutMode,
  layoutEdges,
  shapeSides,
  cornerRoundness,
  viewport,
  numPins,
  sagAmplitude,
  margin,
  scale,
  offsetX,
  offsetY,
}: GenerateLightLayoutPathsOptions): LightLayoutPath[] {
  const bounds = computeBounds(
    viewport,
    margin,
    scale,
    offsetX,
    offsetY,
    layoutMode === 'EDGES',
  );
  const spansPerSide = Math.max(1, numPins - 1);
  const bulbTarget = new Vector3(bounds.centerX, bounds.centerY, 0);
  const safeCornerRoundness = normalizeCornerRoundness(cornerRoundness);

  switch (layoutMode) {
    case 'EDGES':
      return edgeLayoutPaths(layoutEdges, bounds, spansPerSide, sagAmplitude, bulbTarget, safeCornerRoundness);
    case 'SHAPE':
      return [roundedPolygonPath(bounds, shapeSides, safeCornerRoundness, numPins)];
  }
}

function normalizeCornerRoundness(roundness: number): number {
  if (!Number.isFinite(roundness)) return 0;
  const clamped = Math.max(0, Math.min(1, roundness));
  return clamped < CORNER_ROUNDNESS_DISPLAY_EPSILON ? 0 : clamped;
}

function computeBounds(
  viewport: LightLayoutViewport,
  margin: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  reserveHaloInset = false,
): LayoutBounds {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const minDim = Math.min(width, height);
  const inset = Math.min(minDim * Math.max(0, margin), minDim * 0.45);
  const usableWidth = Math.max(1, width - inset * 2) * scale;
  const usableHeight = Math.max(1, height - inset * 2) * scale;
  const centerX = offsetX * minDim * 0.5;
  const centerY = offsetY * minDim * 0.5;
  const edgeInset = minDim * EDGE_INSET_FRACTION;
  const haloSafeInset = reserveHaloInset && margin > 0
    ? minDim * EDGE_HALO_SAFE_INSET_FRACTION
    : 0;
  const left = Math.max(centerX - usableWidth / 2, -width / 2 + haloSafeInset);
  const right = Math.min(centerX + usableWidth / 2, width / 2 - haloSafeInset);
  const bottom = Math.max(centerY - usableHeight / 2, -height / 2 + haloSafeInset);
  const top = Math.min(centerY + usableHeight / 2, height / 2 - haloSafeInset);
  const resolvedCenterX = (left + right) / 2;
  const resolvedCenterY = (bottom + top) / 2;

  return {
    left,
    right,
    top,
    bottom,
    centerX: resolvedCenterX,
    centerY: resolvedCenterY,
    width: right - left,
    height: top - bottom,
    edgeInset,
  };
}

function edgeLayoutPaths(
  edges: readonly LayoutEdgeName[],
  bounds: LayoutBounds,
  spansPerSide: number,
  sagAmplitude: number,
  bulbTarget: Vector3,
  cornerRoundness: number,
): LightLayoutPath[] {
  const edgeRuns = contiguousEdgeRuns(normalizeLayoutEdges(edges));
  return edgeRuns.map((run) => {
    const closed = run.length === LAYOUT_PERIMETER_ORDER.length;
    const id = run.map((edge) => edge.toLowerCase()).join('-');
    if (cornerRoundness > 0 && (closed || run.length > 1)) {
      return roundedEdgePath(id, run, bounds, spansPerSide, sagAmplitude, bulbTarget, closed, cornerRoundness);
    }

    return edgePath(
      id,
      edgeRunSegments(run, bounds, closed),
      spansPerSide,
      sagAmplitude,
      -1,
      bulbTarget,
      closed,
    );
  });
}

function edgePath(
  id: string,
  segments: SegmentSpec[],
  spansPerSegment: number,
  sagAmplitude: number,
  bulbDirectionY: -1 | 1 = -1,
  bulbTarget: Vector3 = new Vector3(0, 0, 0),
  closed = false,
): LightLayoutPath {
  return {
    id,
    ...buildSaggedSegments(segments, spansPerSegment, sagAmplitude),
    spanCount: Math.max(1, segments.length * spansPerSegment),
    closed,
    curveMode: 'SAMPLED',
    wireFrameMode: 'PLANAR',
    bulbDirectionY,
    bulbTarget,
  };
}

function buildSaggedSegments(
  segments: SegmentSpec[],
  spansPerSegment: number,
  sagAmplitude: number,
): Pick<LightLayoutPath, 'points' | 'bulbGuidePoints'> {
  const points: Vector3[] = [];
  const bulbGuidePoints: Vector3[] = [];
  for (const segment of segments) {
    for (let span = 0; span < spansPerSegment; span++) {
      const startT = span / spansPerSegment;
      const endT = (span + 1) / spansPerSegment;
      _lerpA.copy(segment.from).lerp(segment.to, startT);
      _lerpB.copy(segment.from).lerp(segment.to, endT);
      appendSaggedSpan(points, bulbGuidePoints, _lerpA, _lerpB, segment.sagDir, sagAmplitude);
    }
  }
  return { points, bulbGuidePoints };
}

function roundedEdgePath(
  id: string,
  run: readonly LayoutEdgeName[],
  bounds: LayoutBounds,
  spansPerSide: number,
  sagAmplitude: number,
  bulbTarget: Vector3,
  closed: boolean,
  cornerRoundness: number,
): LightLayoutPath {
  const lines = run.map((edge) => perimeterSegment(edge, bounds, {
    trimStart: false,
    trimEnd: false,
  }));
  const cornerRadius = edgeCornerRadius(bounds, cornerRoundness, lines);
  const { points, bulbGuidePoints } = buildRoundedEdgeLines(lines, spansPerSide, sagAmplitude, cornerRadius, closed);

  return {
    id,
    points,
    bulbGuidePoints,
    spanCount: Math.max(1, run.length * spansPerSide),
    closed,
    curveMode: 'SAMPLED',
    wireFrameMode: 'PLANAR',
    bulbDirectionY: -1,
    bulbTarget,
  };
}

function buildRoundedEdgeLines(
  lines: SegmentSpec[],
  spansPerSide: number,
  sagAmplitude: number,
  cornerRadius: number,
  closed: boolean,
): Pick<LightLayoutPath, 'points' | 'bulbGuidePoints'> {
  const points: Vector3[] = [];
  const bulbGuidePoints: Vector3[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const previousConnected = closed || index > 0;
    const nextConnected = closed || index < lines.length - 1;
    const direction = line.to.clone().sub(line.from).normalize();
    const from = line.from.clone().addScaledVector(direction, previousConnected ? cornerRadius : 0);
    const to = line.to.clone().addScaledVector(direction, nextConnected ? -cornerRadius : 0);
    appendSaggedLine(points, bulbGuidePoints, from, to, line.sagDir, spansPerSide, sagAmplitude);

    if (nextConnected) {
      const nextLine = lines[(index + 1) % lines.length]!;
      const nextDirection = nextLine.to.clone().sub(nextLine.from).normalize();
      const cornerStart = to;
      const corner = line.to;
      const cornerEnd = nextLine.from.clone().addScaledVector(nextDirection, cornerRadius);
      appendRoundedCorner(points, bulbGuidePoints, cornerStart, corner, cornerEnd, line.sagDir, nextLine.sagDir);
    }
  }

  return { points, bulbGuidePoints };
}

function appendSaggedLine(
  points: Vector3[],
  bulbGuidePoints: Vector3[],
  from: Vector3,
  to: Vector3,
  sagDir: Vector3,
  spansPerSide: number,
  sagAmplitude: number,
): void {
  for (let span = 0; span < spansPerSide; span++) {
    _lerpA.copy(from).lerp(to, span / spansPerSide);
    _lerpB.copy(from).lerp(to, (span + 1) / spansPerSide);
    appendSaggedSpan(points, bulbGuidePoints, _lerpA, _lerpB, sagDir, sagAmplitude);
  }
}

function appendRoundedCorner(
  points: Vector3[],
  bulbGuidePoints: Vector3[],
  start: Vector3,
  corner: Vector3,
  end: Vector3,
  startGuide: Vector3,
  endGuide: Vector3,
): void {
  if (points.length === 0) {
    points.push(start.clone());
    bulbGuidePoints.push(startGuide.clone());
  }

  for (let step = 1; step <= EDGE_CORNER_STEPS; step++) {
    const t = step / EDGE_CORNER_STEPS;
    points.push(quadraticPoint(start, corner, end, t));
    const guide = startGuide.clone().lerp(endGuide, t);
    if (guide.lengthSq() <= POINT_EPSILON) guide.copy(endGuide);
    bulbGuidePoints.push(guide.normalize());
  }
}

function edgeCornerRadius(
  bounds: LayoutBounds,
  roundness: number,
  lines: readonly SegmentSpec[],
): number {
  const safeRoundness = Math.max(0, Math.min(1, roundness));
  const shortestLine = lines.reduce(
    (min, line) => Math.min(min, line.from.distanceTo(line.to)),
    Number.POSITIVE_INFINITY,
  );
  const maxRadius = Math.min(
    Math.max(0, shortestLine * 0.45),
    Math.min(bounds.width, bounds.height) * EDGE_MAX_CORNER_RADIUS_FRACTION,
  );

  return maxRadius * easedCornerRoundness(safeRoundness);
}

function easedCornerRoundness(roundness: number): number {
  return roundness * roundness * (3 - 2 * roundness);
}

function appendSaggedSpan(
  points: Vector3[],
  bulbGuidePoints: Vector3[],
  from: Vector3,
  to: Vector3,
  sagDir: Vector3,
  sagAmplitude: number,
): void {
  if (points.length === 0) {
    points.push(from.clone());
    bulbGuidePoints.push(sagDir.clone());
  }

  for (let step = 1; step <= SEGMENT_STEPS; step++) {
    const t = step / (SEGMENT_STEPS + 1);
    const parabola = 4 * t * (1 - t);
    _point.copy(from).lerp(to, t).addScaledVector(sagDir, sagAmplitude * parabola);
    points.push(_point.clone());
    bulbGuidePoints.push(sagDir.clone());
  }

  points.push(to.clone());
  bulbGuidePoints.push(sagDir.clone());
}

function roundedPolygonPath(
  bounds: LayoutBounds,
  sides: number,
  roundness: number,
  _numPins: number,
): LightLayoutPath {
  const safeSides = Math.max(3, Math.min(10, Math.round(sides)));
  const safeRoundness = Math.max(0, Math.min(1, roundness));
  const anchors = shapeAnchors(bounds, safeSides);
  const controlPoints = safeRoundness <= 0
    ? subdivideClosedAnchors(anchors)
    : roundedClosedAnchors(anchors, safeRoundness);
  const points = resampleClosedPoints(
    controlPoints,
    Math.max(SHAPE_MIN_SAMPLES, safeSides * SHAPE_SAMPLES_PER_SIDE),
  );

  return {
    id: `shape-${safeSides}`,
    points,
    spanCount: safeSides,
    closed: true,
    curveMode: 'SAMPLED',
    wireFrameMode: 'PLANAR',
    bulbDirectionY: -1,
    bulbTarget: new Vector3(bounds.centerX, bounds.centerY, 0),
  };
}

function shapeAnchors(bounds: LayoutBounds, sides: number): Vector3[] {
  const radius = Math.max(0.5, Math.min(bounds.width, bounds.height) * 0.5);
  if (sides === 4) {
    return [
      new Vector3(bounds.centerX - radius, bounds.centerY + radius, 0),
      new Vector3(bounds.centerX + radius, bounds.centerY + radius, 0),
      new Vector3(bounds.centerX + radius, bounds.centerY - radius, 0),
      new Vector3(bounds.centerX - radius, bounds.centerY - radius, 0),
    ];
  }

  const anchors: Vector3[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = Math.PI / 2 - (i / sides) * Math.PI * 2;
    anchors.push(new Vector3(
      bounds.centerX + Math.cos(angle) * radius,
      bounds.centerY + Math.sin(angle) * radius,
      0,
    ));
  }
  return anchors;
}

function roundedClosedAnchors(anchors: Vector3[], roundness: number): Vector3[] {
  const points: Vector3[] = [];
  const steps = SHAPE_CORNER_STEPS;

  for (let i = 0; i < anchors.length; i++) {
    const prev = anchors[(i - 1 + anchors.length) % anchors.length]!;
    const current = anchors[i]!;
    const next = anchors[(i + 1) % anchors.length]!;
    const incoming = prev.clone().sub(current);
    const outgoing = next.clone().sub(current);
    const cut = Math.min(incoming.length(), outgoing.length()) * 0.5 * roundness;
    const start = current.clone().add(incoming.normalize().multiplyScalar(cut));
    const end = current.clone().add(outgoing.normalize().multiplyScalar(cut));

    points.push(start);
    for (let step = 1; step <= steps; step++) {
      points.push(quadraticPoint(start, current, end, step / steps));
    }
  }

  return points;
}

function quadraticPoint(a: Vector3, b: Vector3, c: Vector3, t: number): Vector3 {
  const oneMinusT = 1 - t;
  return new Vector3(
    oneMinusT * oneMinusT * a.x + 2 * oneMinusT * t * b.x + t * t * c.x,
    oneMinusT * oneMinusT * a.y + 2 * oneMinusT * t * b.y + t * t * c.y,
    oneMinusT * oneMinusT * a.z + 2 * oneMinusT * t * b.z + t * t * c.z,
  );
}

function subdivideClosedAnchors(anchors: Vector3[]): Vector3[] {
  const points: Vector3[] = [];
  const steps = SHAPE_CORNER_STEPS;
  for (let i = 0; i < anchors.length; i++) {
    const from = anchors[i]!;
    const to = anchors[(i + 1) % anchors.length]!;
    for (let step = 0; step < steps; step++) {
      points.push(from.clone().lerp(to, step / steps));
    }
  }
  return points;
}

function resampleClosedPoints(points: Vector3[], sampleCount: number): Vector3[] {
  if (points.length < 2) return points.map((point) => point.clone());

  const cleaned: Vector3[] = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (!previous || previous.distanceTo(point) > POINT_EPSILON) {
      cleaned.push(point.clone());
    }
  }
  if (cleaned.length > 1 && cleaned[0]!.distanceTo(cleaned[cleaned.length - 1]!) <= POINT_EPSILON) {
    cleaned.pop();
  }
  if (cleaned.length < 2) return cleaned;

  const distances: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const from = cleaned[i]!;
    const to = cleaned[(i + 1) % cleaned.length]!;
    const distance = from.distanceTo(to);
    distances.push(distance);
    totalLength += distance;
  }
  if (totalLength <= POINT_EPSILON) return cleaned;

  const targetCount = Math.max(3, Math.round(sampleCount));
  const samples: Vector3[] = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;

  for (let sample = 0; sample < targetCount; sample++) {
    const targetDistance = (sample / targetCount) * totalLength;
    while (
      segmentIndex < distances.length - 1 &&
      segmentStartDistance + distances[segmentIndex]! < targetDistance
    ) {
      segmentStartDistance += distances[segmentIndex]!;
      segmentIndex++;
    }

    const from = cleaned[segmentIndex]!;
    const to = cleaned[(segmentIndex + 1) % cleaned.length]!;
    const segmentLength = Math.max(distances[segmentIndex]!, POINT_EPSILON);
    const t = (targetDistance - segmentStartDistance) / segmentLength;
    samples.push(from.clone().lerp(to, Math.max(0, Math.min(1, t))));
  }

  return samples;
}

function topSegment(bounds: LayoutBounds, trim: SegmentTrim = { trimStart: false, trimEnd: false }): SegmentSpec {
  return {
    from: new Vector3(
      trim.trimStart ? bounds.left + bounds.edgeInset : bounds.left,
      bounds.top - bounds.edgeInset,
      0,
    ),
    to: new Vector3(
      trim.trimEnd ? bounds.right - bounds.edgeInset : bounds.right,
      bounds.top - bounds.edgeInset,
      0,
    ),
    sagDir: new Vector3(0, -1, 0),
  };
}

function bottomSegmentReverse(bounds: LayoutBounds, trim: SegmentTrim = { trimStart: false, trimEnd: false }): SegmentSpec {
  return {
    from: new Vector3(
      trim.trimStart ? bounds.right - bounds.edgeInset : bounds.right,
      bounds.bottom + bounds.edgeInset,
      0,
    ),
    to: new Vector3(
      trim.trimEnd ? bounds.left + bounds.edgeInset : bounds.left,
      bounds.bottom + bounds.edgeInset,
      0,
    ),
    sagDir: new Vector3(0, 1, 0),
  };
}

function rightSegment(bounds: LayoutBounds, trim: SegmentTrim = { trimStart: false, trimEnd: false }): SegmentSpec {
  return {
    from: new Vector3(
      bounds.right - bounds.edgeInset,
      trim.trimStart ? bounds.top - bounds.edgeInset : bounds.top,
      0,
    ),
    to: new Vector3(
      bounds.right - bounds.edgeInset,
      trim.trimEnd ? bounds.bottom + bounds.edgeInset : bounds.bottom,
      0,
    ),
    sagDir: new Vector3(-1, 0, 0),
  };
}

function leftSegment(bounds: LayoutBounds, trim: SegmentTrim = { trimStart: false, trimEnd: false }): SegmentSpec {
  return {
    from: new Vector3(
      bounds.left + bounds.edgeInset,
      trim.trimStart ? bounds.bottom + bounds.edgeInset : bounds.bottom,
      0,
    ),
    to: new Vector3(
      bounds.left + bounds.edgeInset,
      trim.trimEnd ? bounds.top - bounds.edgeInset : bounds.top,
      0,
    ),
    sagDir: new Vector3(1, 0, 0),
  };
}

function perimeterSegment(edge: LayoutEdgeName, bounds: LayoutBounds, trim: SegmentTrim): SegmentSpec {
  switch (edge) {
    case 'TOP':
      return topSegment(bounds, trim);
    case 'RIGHT':
      return rightSegment(bounds, trim);
    case 'BOTTOM':
      return bottomSegmentReverse(bounds, trim);
    case 'LEFT':
      return leftSegment(bounds, trim);
  }
}

function edgeRunSegments(run: readonly LayoutEdgeName[], bounds: LayoutBounds, closed: boolean): SegmentSpec[] {
  return run.map((edge, index) => perimeterSegment(edge, bounds, {
    trimStart: index > 0 || closed,
    trimEnd: index < run.length - 1 || closed,
  }));
}

function contiguousEdgeRuns(edges: readonly LayoutEdgeName[]): LayoutEdgeName[][] {
  const selected = new Set(normalizeLayoutEdges(edges));
  const allSelected = LAYOUT_PERIMETER_ORDER.every((edge) => selected.has(edge));
  if (allSelected) return [[...LAYOUT_PERIMETER_ORDER]];

  const runs: LayoutEdgeName[][] = [];
  for (let i = 0; i < LAYOUT_PERIMETER_ORDER.length; i++) {
    const edge = LAYOUT_PERIMETER_ORDER[i]!;
    const previous = LAYOUT_PERIMETER_ORDER[(i - 1 + LAYOUT_PERIMETER_ORDER.length) % LAYOUT_PERIMETER_ORDER.length]!;
    if (!selected.has(edge) || selected.has(previous)) continue;

    const run: LayoutEdgeName[] = [];
    for (let offset = 0; offset < LAYOUT_PERIMETER_ORDER.length; offset++) {
      const nextEdge = LAYOUT_PERIMETER_ORDER[(i + offset) % LAYOUT_PERIMETER_ORDER.length]!;
      if (!selected.has(nextEdge)) break;
      run.push(nextEdge);
    }
    runs.push(run);
  }

  return runs.length > 0 ? runs : [['TOP']];
}
