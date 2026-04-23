import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';

/**
 * Alpha-lift post-process: ensures the canvas alpha channel tracks the final
 * RGB luminance so HDR highlights (bloom halos, emissive glass, etc.) survive
 * composition against a transparent page background.
 *
 * Why this exists
 * ----------------
 * We render with `alpha: true, premultipliedAlpha: false`. When the overlay
 * scene has `scene.background = null` (BG toggle off), empty space is cleared
 * with `alpha = 0`. The Bloom effect then adds bright RGB into that empty
 * space, but the alpha stays at 0. The browser's CSS compositor multiplies
 * each canvas pixel's RGB by its alpha before blending onto the page, so any
 * RGB that sits in a `alpha = 0` region is effectively invisible — which is
 * why "lighting only looks right when the solid background is on".
 *
 * This pass lifts alpha to `max(alpha, luminance * strength)` so the halo
 * gets the transparency it needs to actually show up. The strength knob lets
 * us keep the effect subtle for dim pixels (so a dark-but-non-zero wire
 * doesn't start glowing), while letting bloom bright-spots punch through.
 */
const fragmentShader = /* glsl */ `
  uniform float uStrength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float luma = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
    float lifted = clamp(luma * uStrength, 0.0, 1.0);
    outputColor = vec4(inputColor.rgb, max(inputColor.a, lifted));
  }
`;

export class AlphaLiftEffect extends Effect {
  constructor({ strength = 1.0 }: { strength?: number } = {}) {
    super('AlphaLiftEffect', fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform<number>>([
        ['uStrength', new Uniform(strength)],
      ]),
    });
  }

  set strength(value: number) {
    const u = this.uniforms.get('uStrength');
    if (u) u.value = value;
  }

  get strength(): number {
    const u = this.uniforms.get('uStrength');
    return u ? (u.value as number) : 1.0;
  }
}
