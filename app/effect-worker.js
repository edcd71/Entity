import {applyPaintEffects} from './paint-effects.js';

self.onmessage = ({data: {id, buffer, width, height, settings, effects = [{type: 'mead', settings}]}}) => {
  try {
    const pixels = applyPaintEffects(new Uint8ClampedArray(buffer), width, height, effects);
    self.postMessage({id, buffer: pixels.buffer}, [pixels.buffer]);
  } catch (error) { self.postMessage({id, error: error.message}); }
};
