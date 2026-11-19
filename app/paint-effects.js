import {applyMeadEffect} from './mead-effect.js';
import {applyMoebiusEffect} from './moebius-effect.js';

// Worker and CPU fallback share the exact same ordered effect pipeline.
export function applyPaintEffects(pixels, width, height, effects) {
  for (const {type, settings} of effects) {
    if (type === 'mead') pixels = applyMeadEffect(pixels, width, height, settings);
    else if (type === 'moebius') pixels = applyMoebiusEffect(pixels, width, height, settings);
    else throw new Error('Unknown paint effect: ' + type);
  }
  return pixels;
}
