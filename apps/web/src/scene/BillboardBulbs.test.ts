import { billboardHaloIntensityForTest } from './billboardHaloMath.ts';
import { readFileSync } from 'node:fs';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fullWrapHalo = billboardHaloIntensityForTest(5, 5, 1);
assert(
  fullWrapHalo > 0.3,
  `enabled lights should feed the billboard wrap halo, got ${fullWrapHalo}`,
);
assert(
  fullWrapHalo < 0.65,
  `billboard wrap halo should stay secondary to the screen-space glow, got ${fullWrapHalo}`,
);

const dimWrapHalo = billboardHaloIntensityForTest(5, 5, 0.25);
assert(
  dimWrapHalo > 0 && dimWrapHalo < fullWrapHalo,
  `dim bulbs should keep a smaller wrap halo, got ${dimWrapHalo}`,
);

const disabledWrapHalo = billboardHaloIntensityForTest(0, 5, 1);
assert(disabledWrapHalo === 0, `disabled halo strength should remove wrap halo, got ${disabledWrapHalo}`);

const source = readFileSync(new URL('./BillboardBulbs.tsx', import.meta.url), 'utf8');
assert(
  source.includes('gl_FragColor = vec4(vColor, alpha);'),
  'billboard halo shader should output straight color because additive blending already applies source alpha',
);
assert(
  source.includes('float radialDistance = length(p);'),
  'billboard halo shader should use a full radial falloff so the glow wraps the whole bulb',
);
