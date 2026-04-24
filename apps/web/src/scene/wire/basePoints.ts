import { Vector3 } from 'three';
import type { Config } from '@melty/shared';

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
  bulbDirectionY: -1 | 1;
  bulbTarget: Vector3;
}

interface GenerateLightLayoutPathsOptions {
  layout: Config['LIGHT_LAYOUT'];
  viewport: LightLayoutViewport;
  numPins: number;
  sagAmplitude: number;
  tension: number;
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

const SEGMENT_STEPS = 12;
const EDGE_INSET_FRACTION = 0.02;
const _lerpA = new Vector3();
const _lerpB = new Vector3();
const _point = new Vector3();

export function generateLightLayoutPaths({
  layout,
  viewport,
  numPins,
  sagAmplitude,
  tension,
  margin,
  scale,
  offsetX,
  offsetY,
}: GenerateLightLayoutPathsOptions): LightLayoutPath[] {
  const bounds = computeBounds(viewport, margin, scale, offsetX, offsetY);
  const spansPerSide = Math.max(1, numPins - 1);
  const bulbTarget = new Vector3(bounds.centerX, bounds.centerY, 0);

  switch (layout) {
    case 'TOP':
      return [edgePath('top', [topSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'BOTTOM':
      return [edgePath('bottom', [bottomSegment(bounds)], spansPerSide, sagAmplitude, tension, 1, bulbTarget)];
    case 'RIGHT':
      return [edgePath('right', [rightSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'LEFT':
      return [edgePath('left', [leftSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'TOP_RIGHT':
      return [edgePath('top-right', [topSegment(bounds), rightSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'TOP_LEFT':
      return [edgePath('top-left', [topSegmentReverse(bounds), leftSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'TOP_BOTTOM':
      return [
        edgePath('top', [topSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget),
        edgePath('bottom', [bottomSegment(bounds)], spansPerSide, sagAmplitude, tension, 1, bulbTarget),
      ];
    case 'BOTTOM_RIGHT':
      return [edgePath('bottom-right', [bottomSegment(bounds), rightSegmentReverse(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'BOTTOM_LEFT':
      return [edgePath('bottom-left', [bottomSegmentReverse(bounds), leftSegmentReverse(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'LEFT_RIGHT':
      return [
        edgePath('left', [leftSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget),
        edgePath('right', [rightSegmentReverse(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget),
      ];
    case 'LEFT_TOP_RIGHT':
      return [edgePath('left-top-right', [leftSegment(bounds), topSegment(bounds), rightSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'TOP_RIGHT_BOTTOM':
      return [edgePath('top-right-bottom', [topSegment(bounds), rightSegment(bounds), bottomSegmentReverse(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'RIGHT_BOTTOM_LEFT':
      return [edgePath('right-bottom-left', [rightSegment(bounds), bottomSegmentReverse(bounds), leftSegmentReverse(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'BOTTOM_LEFT_TOP':
      return [edgePath('bottom-left-top', [bottomSegmentReverse(bounds), leftSegmentReverse(bounds), topSegment(bounds)], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'ALL_SIDES':
      return [edgePath('all-sides', [
        topSegment(bounds),
        rightSegment(bounds),
        bottomSegmentReverse(bounds),
        leftSegmentReverse(bounds),
      ], spansPerSide, sagAmplitude, tension, -1, bulbTarget)];
    case 'DRAPES':
      return [drapePath('drapes', bounds, numPins, sagAmplitude, tension, 0, 1)];
    case 'DUAL_DRAPES':
      return [
        drapePath('drape-front', bounds, numPins, sagAmplitude, tension, 0, 1),
        drapePath('drape-back', bounds, numPins, sagAmplitude, tension, 0.48, 0.72),
      ];
    case 'CIRCLE':
      return [circlePath(bounds, numPins)];
    case 'TRIANGLE':
      return [polygonPath('triangle', bounds, 3)];
    case 'SQUARE':
      return [squarePath(bounds)];
    case 'PENTAGON':
      return [polygonPath('pentagon', bounds, 5)];
    case 'HEXAGON':
      return [polygonPath('hexagon', bounds, 6)];
    case 'HEPTAGON':
      return [polygonPath('heptagon', bounds, 7)];
    case 'OCTAGON':
      return [polygonPath('octagon', bounds, 8)];
  }
}

// Legacy single-string fallback retained for old imports and quick experiments.
export function generateBasePoints(
  numPins: number,
  sagAmplitude: number,
  tension: number,
  _wireTwists: number = 0,
): Vector3[] {
  return generateLightLayoutPaths({
    layout: 'TOP',
    viewport: { width: 32, height: 18 },
    numPins,
    sagAmplitude,
    tension,
    margin: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  })[0]!.points;
}

function computeBounds(
  viewport: LightLayoutViewport,
  margin: number,
  scale: number,
  offsetX: number,
  offsetY: number,
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

  return {
    left: centerX - usableWidth / 2,
    right: centerX + usableWidth / 2,
    top: centerY + usableHeight / 2,
    bottom: centerY - usableHeight / 2,
    centerX,
    centerY,
    width: usableWidth,
    height: usableHeight,
    edgeInset,
  };
}

function edgePath(
  id: string,
  segments: SegmentSpec[],
  spansPerSegment: number,
  sagAmplitude: number,
  tension: number,
  bulbDirectionY: -1 | 1 = -1,
  bulbTarget: Vector3 = new Vector3(0, 0, 0),
): LightLayoutPath {
  return {
    id,
    ...buildSaggedSegments(segments, spansPerSegment, sagAmplitude, tension),
    spanCount: Math.max(1, segments.length * spansPerSegment),
    bulbDirectionY,
    bulbTarget,
  };
}

function buildSaggedSegments(
  segments: SegmentSpec[],
  spansPerSegment: number,
  sagAmplitude: number,
  tension: number,
): Pick<LightLayoutPath, 'points' | 'bulbGuidePoints'> {
  const points: Vector3[] = [];
  const bulbGuidePoints: Vector3[] = [];
  for (const segment of segments) {
    for (let span = 0; span < spansPerSegment; span++) {
      const startT = span / spansPerSegment;
      const endT = (span + 1) / spansPerSegment;
      _lerpA.copy(segment.from).lerp(segment.to, startT);
      _lerpB.copy(segment.from).lerp(segment.to, endT);
      appendSaggedSpan(points, bulbGuidePoints, _lerpA, _lerpB, segment.sagDir, sagAmplitude, tension);
    }
  }
  return { points, bulbGuidePoints };
}

function appendSaggedSpan(
  points: Vector3[],
  bulbGuidePoints: Vector3[],
  from: Vector3,
  to: Vector3,
  sagDir: Vector3,
  sagAmplitude: number,
  tension: number,
): void {
  if (points.length === 0) {
    points.push(from.clone());
    bulbGuidePoints.push(sagDir.clone());
  }

  const clampedTension = Math.max(-1, Math.min(1, tension));
  const blendFactor = Math.max(0, clampedTension);
  const easedSag = sagAmplitude * (1 - Math.min(0.8, Math.max(0, clampedTension) * 0.55));

  for (let step = 1; step <= SEGMENT_STEPS; step++) {
    const t = step / (SEGMENT_STEPS + 1);
    const parabola = 4 * t * (1 - t);
    const centerDist = Math.abs(t - 0.5) * 2;
    const catenary = 1 - Math.pow(centerDist, 0.5 + blendFactor * 0.5);
    const dropAmount = parabola * (1 - blendFactor) + catenary * blendFactor;
    _point.copy(from).lerp(to, t).addScaledVector(sagDir, easedSag * dropAmount);
    points.push(_point.clone());
    bulbGuidePoints.push(sagDir.clone());
  }

  points.push(to.clone());
  bulbGuidePoints.push(sagDir.clone());
}

function drapePath(
  id: string,
  bounds: LayoutBounds,
  numPins: number,
  sagAmplitude: number,
  tension: number,
  phase: number,
  depthScale: number,
): LightLayoutPath {
  const panels = Math.max(2, numPins - 1);
  const panelWidth = bounds.width / panels;
  const top = bounds.top - bounds.height * 0.08 * phase;
  const depth = bounds.height * (0.18 + sagAmplitude * 0.06) * depthScale;
  const points: Vector3[] = [];
  const bulbGuidePoints: Vector3[] = [];
  const clampedTension = Math.max(-1, Math.min(1, tension));
  const tensionLift = Math.max(0, clampedTension) * 0.45;
  const startX = bounds.left + panelWidth * 0.5 * phase;
  const endX = bounds.right - panelWidth * 0.5 * phase;
  const adjustedPanelWidth = (endX - startX) / panels;

  points.push(new Vector3(startX, top, 0));
  bulbGuidePoints.push(new Vector3(0, -1, 0));
  for (let panel = 0; panel < panels; panel++) {
    const x0 = startX + panel * adjustedPanelWidth;
    const x1 = startX + (panel + 1) * adjustedPanelWidth;
    for (let step = 1; step <= SEGMENT_STEPS + 1; step++) {
      const t = step / (SEGMENT_STEPS + 1);
      const drop = 4 * t * (1 - t);
      const y = top - depth * drop * (1 - tensionLift);
      points.push(new Vector3(x0 + (x1 - x0) * t, y, 0));
      bulbGuidePoints.push(new Vector3(0, -1, 0));
    }
  }

  return {
    id,
    points,
    bulbGuidePoints,
    spanCount: panels,
    bulbDirectionY: -1,
    bulbTarget: new Vector3(bounds.centerX, bounds.centerY, 0),
  };
}

function circlePath(bounds: LayoutBounds, numPins: number): LightLayoutPath {
  const radius = Math.max(0.5, Math.min(bounds.width, bounds.height) * 0.5);
  const pointCount = Math.max(48, numPins * 8);
  const points: Vector3[] = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = Math.PI / 2 - (i / pointCount) * Math.PI * 2;
    points.push(new Vector3(
      bounds.centerX + Math.cos(angle) * radius,
      bounds.centerY + Math.sin(angle) * radius,
      0,
    ));
  }
  return {
    id: 'circle',
    points,
    spanCount: Math.max(8, numPins),
    closed: true,
    bulbDirectionY: -1,
    bulbTarget: new Vector3(bounds.centerX, bounds.centerY, 0),
  };
}

function polygonPath(id: string, bounds: LayoutBounds, sides: number): LightLayoutPath {
  const radius = Math.max(0.5, Math.min(bounds.width, bounds.height) * 0.5);
  const anchors: Vector3[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = Math.PI / 2 - (i / sides) * Math.PI * 2;
    anchors.push(new Vector3(
      bounds.centerX + Math.cos(angle) * radius,
      bounds.centerY + Math.sin(angle) * radius,
      0,
    ));
  }
  return {
    id,
    points: subdivideClosedAnchors(anchors),
    spanCount: sides,
    closed: true,
    bulbDirectionY: -1,
    bulbTarget: new Vector3(bounds.centerX, bounds.centerY, 0),
  };
}

function squarePath(bounds: LayoutBounds): LightLayoutPath {
  const radius = Math.max(0.5, Math.min(bounds.width, bounds.height) * 0.5);
  const anchors = [
    new Vector3(bounds.centerX - radius, bounds.centerY + radius, 0),
    new Vector3(bounds.centerX + radius, bounds.centerY + radius, 0),
    new Vector3(bounds.centerX + radius, bounds.centerY - radius, 0),
    new Vector3(bounds.centerX - radius, bounds.centerY - radius, 0),
  ];
  return {
    id: 'square',
    points: subdivideClosedAnchors(anchors),
    spanCount: 4,
    closed: true,
    bulbDirectionY: -1,
    bulbTarget: new Vector3(bounds.centerX, bounds.centerY, 0),
  };
}

function subdivideClosedAnchors(anchors: Vector3[]): Vector3[] {
  const points: Vector3[] = [];
  const steps = 8;
  for (let i = 0; i < anchors.length; i++) {
    const from = anchors[i]!;
    const to = anchors[(i + 1) % anchors.length]!;
    for (let step = 0; step < steps; step++) {
      points.push(from.clone().lerp(to, step / steps));
    }
  }
  return points;
}

function topSegment(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.left, bounds.top - bounds.edgeInset, 0),
    to: new Vector3(bounds.right, bounds.top - bounds.edgeInset, 0),
    sagDir: new Vector3(0, -1, 0),
  };
}

function topSegmentReverse(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.right, bounds.top - bounds.edgeInset, 0),
    to: new Vector3(bounds.left, bounds.top - bounds.edgeInset, 0),
    sagDir: new Vector3(0, -1, 0),
  };
}

function bottomSegment(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.left, bounds.bottom + bounds.edgeInset, 0),
    to: new Vector3(bounds.right, bounds.bottom + bounds.edgeInset, 0),
    sagDir: new Vector3(0, 1, 0),
  };
}

function bottomSegmentReverse(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.right, bounds.bottom + bounds.edgeInset, 0),
    to: new Vector3(bounds.left, bounds.bottom + bounds.edgeInset, 0),
    sagDir: new Vector3(0, 1, 0),
  };
}

function rightSegment(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.right - bounds.edgeInset, bounds.top, 0),
    to: new Vector3(bounds.right - bounds.edgeInset, bounds.bottom, 0),
    sagDir: new Vector3(-1, 0, 0),
  };
}

function rightSegmentReverse(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.right - bounds.edgeInset, bounds.bottom, 0),
    to: new Vector3(bounds.right - bounds.edgeInset, bounds.top, 0),
    sagDir: new Vector3(-1, 0, 0),
  };
}

function leftSegment(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.left + bounds.edgeInset, bounds.bottom, 0),
    to: new Vector3(bounds.left + bounds.edgeInset, bounds.top, 0),
    sagDir: new Vector3(1, 0, 0),
  };
}

function leftSegmentReverse(bounds: LayoutBounds): SegmentSpec {
  return {
    from: new Vector3(bounds.left + bounds.edgeInset, bounds.top, 0),
    to: new Vector3(bounds.left + bounds.edgeInset, bounds.bottom, 0),
    sagDir: new Vector3(1, 0, 0),
  };
}
