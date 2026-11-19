import {quantizePixels} from './pixel-art.js';
import {applyPaintEffects} from './paint-effects.js';

// One owner for thumbnail sources lets the controls compose without overwriting
// each other or repeatedly filtering a previously transformed image.
export function mountGridEffects(grid, beforeImageChange, controls) {
  const records = new Map(), nearby = new Set(), queue = new Set(), jobs = new Map();
  let pixel = {enabled: false, size: 6, colors: 16};
  let mead = {enabled: false, amount: 80, lines: 45, palette: 'daylight'};
  let moebius = {enabled: false, amount: 85, lines: 65, palette: 'desert'};
  let revision = 0, active = 0, frame = 0, jobId = 0, worker, workerUnavailable = false;
  const enabled = () => pixel.enabled || mead.enabled || moebius.enabled;

  function failWorker() {
    workerUnavailable = true;
    worker?.terminate(); worker = null;
    for (const job of jobs.values()) {clearTimeout(job.timer); job.reject(new Error('Effect worker unavailable'));}
    jobs.clear();
  }
  async function paint(pixels, width, height, effects) {
    if (!worker && !workerUnavailable) {
      try {
        worker = new Worker(new URL('./effect-worker.js', import.meta.url), {type: 'module'});
        worker.onerror = event => {event.preventDefault(); failWorker();};
        worker.onmessage = ({data}) => {
          const job = jobs.get(data.id);
          if (!job) return;
          jobs.delete(data.id); clearTimeout(job.timer);
          if (data.error) job.reject(new Error(data.error));
          else job.resolve(new Uint8ClampedArray(data.buffer));
        };
      } catch {workerUnavailable = true;}
    }
    if (!worker) return applyPaintEffects(pixels, width, height, effects);
    const backup = pixels.slice();
    try {
      return await new Promise((resolve, reject) => {
        const id = ++jobId;
        const timer = setTimeout(failWorker, 10000);
        jobs.set(id, {resolve, reject, timer});
        try {worker.postMessage({id, buffer: pixels.buffer, width, height, effects}, [pixels.buffer]);}
        catch (error) {jobs.delete(id); clearTimeout(timer); reject(error);}
      });
    } catch {return applyPaintEffects(backup, width, height, effects);}
  }
  function schedule() {
    if (enabled() && queue.size && active < 3 && !frame) frame = requestAnimationFrame(pump);
  }
  function enqueue(record) {
    if (!enabled() || !record.image.isConnected || !nearby.has(record)) return;
    queue.add(record); schedule();
  }
  function pump() {
    frame = 0;
    for (let n = 0; n < 2 && active < 3 && queue.size; n++) {
      const record = queue.values().next().value;
      queue.delete(record); active++;
      render(record).catch(() => {
        // An unavailable thumbnail keeps its original image; other photos continue.
      }).finally(() => {active--; schedule();});
    }
    schedule();
  }
  async function render(record) {
    const {image, button, source} = record;
    const version = revision, px = {...pixel}, concept = {...mead}, illustration = {...moebius};
    const effects = [];
    if (concept.enabled) effects.push({type: 'mead', settings: concept});
    if (illustration.enabled) effects.push({type: 'moebius', settings: illustration});
    const valid = () => enabled() && revision === version && image.isConnected && nearby.has(record);
    if (!valid()) return;
    const bounds = button.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const columns = Math.max(2, Math.min(192, Math.round(bounds.width / px.size)));
    const rows = Math.max(2, Math.min(192, Math.round(bounds.height / px.size)));
    const density = Math.min(devicePixelRatio || 1, 2);
    const scale = Math.min(density, 320 / Math.max(bounds.width, bounds.height));
    const width = effects.length ? Math.max(2, Math.round(bounds.width * scale)) : columns;
    const height = effects.length ? Math.max(2, Math.round(bounds.height * scale)) : rows;
    const key = JSON.stringify([width, height, (bounds.width / bounds.height).toFixed(4), px.enabled ? [columns, rows, px.colors] : null, effects]);
    if (record.applied === key) return;
    let url = record.cache?.key === key ? record.cache.url : null;
    if (!url) {
      const original = new Image(); original.src = source;
      await original.decode();
      if (!valid()) return;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      const ratio = Math.max(bounds.width / original.naturalWidth, bounds.height / original.naturalHeight);
      const sw = bounds.width / ratio, sh = bounds.height / ratio;
      context.drawImage(original, (original.naturalWidth - sw) / 2, (original.naturalHeight - sh) / 2, sw, sh, 0, 0, width, height);
      if (effects.length) {
        const data = context.getImageData(0, 0, width, height);
        const rendered = await paint(data.data, width, height, effects);
        if (!valid()) return;
        context.putImageData(new ImageData(rendered, width, height), 0, 0);
      }
      let output = canvas;
      if (px.enabled) {
        if (effects.length) {
          output = document.createElement('canvas'); output.width = columns; output.height = rows;
          output.getContext('2d').drawImage(canvas, 0, 0, columns, rows);
        }
        const ctx = output.getContext('2d', {willReadFrequently: true});
        const data = ctx.getImageData(0, 0, output.width, output.height);
        quantizePixels(data.data, px.colors);
        ctx.putImageData(data, 0, 0);
      }
      url = output.toDataURL('image/png');
      const ready = new Image(); ready.src = url;
      await ready.decode();
      if (!valid()) return;
      record.cache = {key, url};
    }
    if (!valid()) return;
    beforeImageChange(image);
    image.dataset.gridEffect = 'true';
    if (px.enabled) image.dataset.pixelArt = 'true'; else delete image.dataset.pixelArt;
    if (concept.enabled) image.dataset.mead = 'true'; else delete image.dataset.mead;
    if (illustration.enabled) image.dataset.moebius = 'true'; else delete image.dataset.moebius;
    image.src = url;
    record.applied = key;
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = records.get(entry.target);
      if (entry.isIntersecting) {nearby.add(record); enqueue(record);}
      else {nearby.delete(record); queue.delete(record);}
    }
  }, {root: grid, rootMargin: '0px 320px', threshold: 0});
  function refresh() {for (const record of nearby) enqueue(record);}
  new ResizeObserver(refresh).observe(grid);
  function update() {
    revision++; queue.clear();
    grid.toggleAttribute('data-pixel-art', pixel.enabled);
    grid.toggleAttribute('data-mead', mead.enabled);
    grid.toggleAttribute('data-moebius', moebius.enabled);
    const layers = [mead.enabled && 'Syd Mead', moebius.enabled && 'Moebius', pixel.enabled && 'Pixel art'].filter(Boolean);
    const hint = layers.length > 1 ? layers.join(' → ') : 'All grid images';
    controls.querySelector('.pixel-filter .pixel-hint').textContent = hint;
    controls.querySelector('.mead-hint').textContent = hint;
    controls.querySelector('.moebius-hint').textContent = hint;
    if (enabled()) {refresh(); return;}
    for (const record of records.values()) {
      if (!record.applied) continue;
      beforeImageChange(record.image);
      for (const key of ['gridEffect', 'pixelArt', 'mead', 'moebius']) delete record.image.dataset[key];
      record.image.src = record.source; record.applied = null;
    }
  }
  return {
    register(photos) {
      for (const photo of photos) {
        if (records.has(photo.button)) continue;
        records.set(photo.button, {button: photo.button, image: photo.button.firstElementChild, source: photo.thumbnail});
        observer.observe(photo.button);
      }
    },
    setPixel(next) {pixel = {...next}; update();},
    setMead(next) {mead = {...next}; update();},
    setMoebius(next) {moebius = {...next}; update();},
    refresh,
  };
}
