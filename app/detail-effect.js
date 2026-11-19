import {applyMeadEffect} from './mead-effect.js';

// Detail has its own cancellable worker so a full-size render never queues behind
// thumbnail jobs. Only the current photo is retained, at its preview resolution.
export function mountDetailEffect(image) {
  const pane = image.parentElement;
  let source = '', settings = {enabled: false}, revision = 0, renderedURL = null;
  let cancelPainting;

  function cancel() {
    revision++;
    cancelPainting?.();
    cancelPainting = null;
    pane.removeAttribute('aria-busy');
  }
  function releaseURL() {
    if (renderedURL) URL.revokeObjectURL(renderedURL);
    renderedURL = null;
  }
  function restore() {
    if (source) image.src = source;
    delete image.dataset.mead;
    releaseURL();
  }
  async function paint(pixels, width, height, values) {
    let worker, timer;
    const backup = pixels.slice();
    try {
      return await new Promise((resolve, reject) => {
        cancelPainting = () => reject(new DOMException('Superseded detail render', 'AbortError'));
        worker = new Worker(new URL('./effect-worker.js', import.meta.url), {type: 'module'});
        worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(new Uint8ClampedArray(data.buffer));
        worker.onerror = event => {event.preventDefault(); reject(new Error('Detail worker unavailable'));};
        timer = setTimeout(() => reject(new Error('Detail worker timed out')), 30000);
        worker.postMessage({id: 1, buffer: pixels.buffer, width, height, settings: values}, [pixels.buffer]);
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      return applyMeadEffect(backup, width, height, values);
    } finally {
      clearTimeout(timer);
      worker?.terminate();
    }
  }
  async function render() {
    cancel();
    restore();
    if (!source || !settings.enabled || !settings.amount) return;
    const version = revision, values = {...settings};
    const valid = () => revision === version;
    pane.setAttribute('aria-busy', 'true');
    let pendingURL;
    try {
      const original = new Image();
      original.src = source;
      await original.decode();
      if (!valid()) return;
      const canvas = document.createElement('canvas');
      canvas.width = original.naturalWidth;
      canvas.height = original.naturalHeight;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(original, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = await paint(data.data, canvas.width, canvas.height, values);
      if (!valid()) return;
      context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!valid() || !blob) return;
      pendingURL = URL.createObjectURL(blob);
      const ready = new Image(); ready.src = pendingURL;
      await ready.decode();
      if (!valid()) return;
      image.src = pendingURL;
      image.dataset.mead = 'true';
      renderedURL = pendingURL;
      pendingURL = null;
    } catch {
      // Keep the original preview usable if decoding or rendering fails.
    } finally {
      if (pendingURL) URL.revokeObjectURL(pendingURL);
      if (valid()) {cancelPainting = null; pane.removeAttribute('aria-busy');}
    }
  }
  return {
    show(photo) {source = photo.preview || photo.thumbnail; render();},
    setMead(next) {settings = {...next}; if (source) render();},
    clear() {cancel(); source = ''; delete image.dataset.mead; releaseURL();},
  };
}
