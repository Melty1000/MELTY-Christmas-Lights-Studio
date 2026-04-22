import { Color } from 'three';
import type { Config } from '@melty/shared';

const TWO_PI = Math.PI * 2;
const _fromColor = new Color();
const _toColor = new Color();
const _blendedColor = new Color();

export interface BulbAnimationState {
  currentIntensity: number;
  phase: number;
  sparkleOn: boolean;
  nextSparkleAt: number;
}

export interface BulbAnimationResult {
  colorHex: number;
  intensity: number;
}

export function createBulbAnimationState(index: number): BulbAnimationState {
  const phase = pseudoRandom(index + 1);

  return {
    currentIntensity: 1,
    phase,
    sparkleOn: phase > 0.55,
    nextSparkleAt: phase * 1.75,
  };
}

export function stepBulbAnimation(
  state: BulbAnimationState,
  config: Config,
  elapsed: number,
  delta: number,
  index: number,
  total: number,
  baseColorHex: number,
  themePalette: number[],
): BulbAnimationResult {
  const minI = clamp(config.TWINKLE_MIN_INTENSITY, 0, 1);
  const maxI = clamp(Math.max(config.TWINKLE_MAX_INTENSITY, minI), 0, 1.4);
  const twinkleSpeed = 0.1 + config.TWINKLE_SPEED * 1.35;
  const motionSpeed = 0.18 + config.ANIMATION_SPEED * 0.42;
  const randomness = config.TWINKLE_RANDOMNESS * state.phase;
  const phase = elapsed * twinkleSpeed + state.phase * TWO_PI * (1 + randomness);

  let targetIntensity = maxI;
  let colorHex = baseColorHex;

  switch (config.ANIMATION_STYLE) {
    case 'STATIC':
      targetIntensity = maxI;
      break;
    case 'SOFT_TWINKLE':
      targetIntensity = rangeLerp(minI, maxI, 0.5 + Math.sin(phase) * 0.5);
      break;
    case 'ALTERNATING': {
      const alternatingPhase = elapsed * motionSpeed * 2 + (index % 2 === 0 ? 0 : Math.PI);
      targetIntensity = rangeLerp(minI, maxI, 0.5 + Math.sin(alternatingPhase) * 0.5);
      break;
    }
    case 'CHASE': {
      const wave = elapsed * motionSpeed * 3 - (index / Math.max(total, 1)) * TWO_PI * 2;
      targetIntensity = rangeLerp(minI, maxI, Math.max(0, Math.sin(wave)));
      break;
    }
    case 'RANDOM_SPARKLE':
      if (elapsed >= state.nextSparkleAt) {
        state.sparkleOn = !state.sparkleOn;
        const onWindow = 0.06 + pseudoRandom(index + elapsed) * 0.28;
        const offWindow = 0.18 + pseudoRandom(index * 11 + elapsed) * 1.1;
        state.nextSparkleAt = elapsed + (state.sparkleOn ? onWindow : offWindow) / Math.max(0.25, twinkleSpeed);
      }
      targetIntensity = state.sparkleOn ? maxI : minI;
      break;
    case 'COLOR_FADE':
      targetIntensity = maxI;
      colorHex = blendPaletteColor(themePalette, elapsed * motionSpeed * 0.75 + index * 0.1);
      break;
    case 'PARTY':
      targetIntensity = rangeLerp(
        minI,
        maxI,
        (Math.sin(elapsed * motionSpeed * 6 + state.phase * 10) * Math.sin(elapsed * motionSpeed * 3.8 + index)) * 0.5 + 0.5,
      );
      colorHex = blendPaletteColor(themePalette, elapsed * motionSpeed * 2.8 + index * 0.17);
      break;
  }

  const smoothing = clamp(delta * (5.5 + twinkleSpeed * 2.4), 0, 1);
  state.currentIntensity += (targetIntensity - state.currentIntensity) * smoothing;

  return {
    colorHex,
    intensity: clamp(state.currentIntensity, 0, 2),
  };
}

function blendPaletteColor(palette: number[], progress: number): number {
  if (palette.length === 0) return 0xffffff;
  if (palette.length === 1) return palette[0]!;

  const wrapped = ((progress % palette.length) + palette.length) % palette.length;
  const baseIndex = Math.floor(wrapped) % palette.length;
  const nextIndex = (baseIndex + 1) % palette.length;
  const alpha = wrapped - Math.floor(wrapped);
  const eased = alpha * alpha * (3 - 2 * alpha);

  _fromColor.setHex(palette[baseIndex]!);
  _toColor.setHex(palette[nextIndex]!);
  _blendedColor.copy(_fromColor).lerp(_toColor, eased);

  return _blendedColor.getHex();
}

function rangeLerp(min: number, max: number, t: number): number {
  return min + (max - min) * clamp(t, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
