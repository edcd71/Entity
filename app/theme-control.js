import {mountFloatingRail} from './floating-rail.js';

const themes = {light: '#f6f5f0', dark: '#151517', blue: '#2047df'};
const storageKey = 'entity-theme';

export function mountThemeControl(rail) {
  const options = [...rail.querySelectorAll('input[name="appearance"]')];
  function apply(value, save = false) {
    const theme = Object.hasOwn(themes, value) ? value : 'blue';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = themes[theme];
    for (const option of options) option.checked = option.value === theme;
    if (save) {
      try { localStorage.setItem(storageKey, theme); } catch {}
    }
    document.dispatchEvent(new CustomEvent('entitythemechange', {detail: {theme}}));
  }
  rail.addEventListener('change', event => {
    if (options.includes(event.target)) apply(event.target.value, true);
  });
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) apply(event.newValue);
  });
  apply(document.documentElement.dataset.theme);
  mountFloatingRail(rail, 'theme control');
}
