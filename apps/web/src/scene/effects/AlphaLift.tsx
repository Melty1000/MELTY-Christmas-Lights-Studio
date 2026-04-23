import { wrapEffect } from '@react-three/postprocessing';
import { AlphaLiftEffect } from './AlphaLiftEffect.ts';

export const AlphaLift = wrapEffect(AlphaLiftEffect);
