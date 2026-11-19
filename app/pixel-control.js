import {mountFloatingRail} from './floating-rail.js';

const storageKey = 'entity-pixel-art';
const defaults = {enabled: false, size: 6, colors: 16};
function normalize(value) {
  return {
    enabled: value?.enabled === true,
    size: Number.isInteger(value?.size) ? Math.max(2, Math.min(16, value.size)) : defaults.size,
    colors: [8, 16, 32].includes(value?.colors) ? value.colors : defaults.colors,
  };
}

export function mountPixelControl(rail, onChange) {
  const mode = [...rail.querySelectorAll('[name="pixel-mode"]')];
  const size = rail.querySelector('.pixel-size');
  const readout = rail.querySelector('.pixel-size-value');
  const palettes = [...rail.querySelectorAll('[name="pixel-colors"]')];
  let settings = {...defaults};
  try { settings = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch {}
  function render(save = false) {
    for (const radio of mode) radio.checked = (radio.value === 'art') === settings.enabled;
    for (const radio of palettes) { radio.checked = Number(radio.value) === settings.colors; radio.disabled = !settings.enabled; }
    size.value = settings.size;
    size.disabled = !settings.enabled;
    size.setAttribute('aria-valuetext', settings.size + ' pixels');
    readout.textContent = settings.size + ' px';
    rail.toggleAttribute('data-active', settings.enabled);
    rail.setAttribute('aria-description', settings.enabled ? `Pixel art on all grid images, ${settings.size}-pixel blocks, ${settings.colors} colors per image.` : 'Original grid images.');
    if (save) {try {localStorage.setItem(storageKey, JSON.stringify(settings));} catch {}}
    onChange({...settings});
  }
  rail.addEventListener('change', event => {
    if (mode.includes(event.target)) settings.enabled = event.target.value === 'art';
    else if (palettes.includes(event.target)) settings.colors = Number(event.target.value);
    else return;
    render(true);
  });
  size.addEventListener('input', () => { settings.size = Number(size.value); render(true); });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try { settings = normalize(JSON.parse(event.newValue)); } catch { settings = {...defaults}; }
    render();
  });
  render();
  mountFloatingRail(rail, 'pixel art');
}
