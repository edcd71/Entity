import {mountFloatingRail} from './floating-rail.js';

const storageKey = 'entity-moebius';
const defaults = {enabled: false, amount: 85, lines: 65, palette: 'desert'};
function normalize(value) {
  const percent = key => Number.isFinite(value?.[key]) ? Math.max(0, Math.min(100, Math.round(value[key]))) : defaults[key];
  return {enabled: value?.enabled === true, amount: percent('amount'), lines: percent('lines'), palette: value?.palette === 'cosmic' ? 'cosmic' : 'desert'};
}
export function mountMoebiusControl(rail, onChange) {
  const modes = [...rail.querySelectorAll('[name="moebius-mode"]')];
  const palettes = [...rail.querySelectorAll('[name="moebius-palette"]')];
  const sliders = [...rail.querySelectorAll('[data-moebius-setting]')];
  let settings = {...defaults};
  try { settings = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch {}
  function render(save = false) {
    for (const input of modes) input.checked = (input.value === 'on') === settings.enabled;
    for (const input of palettes) {input.checked = input.value === settings.palette; input.disabled = !settings.enabled;}
    for (const input of sliders) {
      const value = settings[input.dataset.moebiusSetting];
      input.value = value;
      input.disabled = !settings.enabled;
      input.setAttribute('aria-valuetext', value + ' percent');
      rail.querySelector(`output[for="${input.id}"]`).textContent = value + '%';
    }
    rail.toggleAttribute('data-active', settings.enabled);
    rail.setAttribute('aria-description', settings.enabled ? `Moebius-inspired ink and pastel rendering on all grid images, ${settings.amount}% strength, ${settings.lines}% linework, ${settings.palette} palette.` : 'Moebius effect off.');
    if (save) {try {localStorage.setItem(storageKey, JSON.stringify(settings));} catch {}}
    onChange({...settings});
  }
  rail.addEventListener('change', event => {
    if (modes.includes(event.target)) settings.enabled = event.target.value === 'on';
    else if (palettes.includes(event.target)) settings.palette = event.target.value;
    else return;
    render(true);
  });
  for (const input of sliders) input.addEventListener('input', () => {settings[input.dataset.moebiusSetting] = Number(input.value); render(true);});
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {settings = normalize(JSON.parse(event.newValue));} catch {settings = {...defaults};}
    render();
  });
  render();
  mountFloatingRail(rail, 'Moebius effect');
}
