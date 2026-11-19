import { mountFloatingRail } from './floating-rail.js';

// The archive compares sRGB swatches in D65 CIE Lab.
export function hexToLab(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value > .04045 ? ((value + .055) / 1.055) ** 2.4 : value / 12.92;
  });
  const xyz = [(r * .4124564 + g * .3575761 + b * .1804375) / .95047,
    r * .2126729 + g * .7151522 + b * .072175, (r * .0193339 + g * .119192 + b * .9503041) / 1.08883];
  const [x, y, z] = xyz.map(v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function rankByColor(photos, hex) {
  const [l, a, b] = hexToLab(hex);
  return photos.map(photo => ({
    photo,
    distance: Math.min(...photo.labColors.map(([pl, pa, pb]) => (pl - l) ** 2 + (pa - a) ** 2 + (pb - b) ** 2)),
  })).sort((first, second) => first.distance - second.distance).map(match => match.photo);
}

export function mountColorPad(rail, onSort) {
  const field = rail.querySelector('.sample-field');
  const ctx = field.getContext('2d', {willReadFrequently: true});
  const pad = field.parentElement;
  const zoom = pad.querySelector('.sample-loupe').getContext('2d');
  const hue = rail.querySelector('.sample-hue');
  const readout = rail.querySelector('output');
  const clear = rail.querySelector('.clear-color');
  let x = 200, y = 20, selection = null, drag = null;

  function preview() {
    const rgb = ctx.getImageData(x, y, 1, 1).data;
    const hex = '#' + Array.from(rgb.slice(0, 3), v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    readout.value = hex;
    rail.style.setProperty('--sampled-color', hex);
    pad.style.setProperty('--px', (100 * x / (field.width - 1)) + '%');
    pad.style.setProperty('--py', (100 * y / (field.height - 1)) + '%');
    if (drag) {
      zoom.fillStyle = hex;
      zoom.fillRect(0, 0, 48, 48);
      zoom.imageSmoothingEnabled = false;
      zoom.drawImage(field, 22 - x * 4, 22 - y * 4, field.width * 4, field.height * 4);
      zoom.strokeStyle = y < field.height / 2 ? '#0009' : '#fffc';
      zoom.strokeRect(21.5, 21.5, 5, 5);
    }
  }

  function paintField() {
    const {width, height} = field;
    const base = 'hsl(' + hue.value + ' 100% 50%)';
    rail.style.setProperty('--hue-color', base);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    const saturation = ctx.createLinearGradient(.5, 0, width - .5, 0);
    saturation.addColorStop(0, '#fff');
    saturation.addColorStop(1, '#ffffff00');
    ctx.fillStyle = saturation;
    ctx.fillRect(0, 0, width, height);
    const brightness = ctx.createLinearGradient(0, .5, 0, height - .5);
    brightness.addColorStop(0, '#0000');
    brightness.addColorStop(1, '#000');
    ctx.fillStyle = brightness;
    ctx.fillRect(0, 0, width, height);
    preview();
  }

  function commit(hex) {
    if (selection === hex) return;
    selection = hex;
    clear.disabled = !hex;
    rail.style.setProperty('--sorted-color', hex || '');
    onSort(hex);
  }
  function atPointer(event) {
    const bounds = field.getBoundingClientRect();
    x = Math.max(0, Math.min(field.width - 1, Math.floor((event.clientX - bounds.left) * field.width / bounds.width)));
    y = Math.max(0, Math.min(field.height - 1, Math.floor((event.clientY - bounds.top) * field.height / bounds.height)));
    preview();
  }
  field.addEventListener('pointerdown', event => {
    if (drag || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    drag = {id: event.pointerId, x, y};
    field.focus({preventScroll: true});
    field.setPointerCapture(event.pointerId);
    pad.classList.add('picking');
    atPointer(event);
  });
  field.addEventListener('pointermove', event => { if (event.pointerId === drag?.id) atPointer(event); });
  field.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.id) return;
    atPointer(event);
    drag = null;
    pad.classList.remove('picking');
    commit(readout.value);
  });
  function cancelPick() {
    if (!drag) return;
    ({x, y} = drag);
    drag = null;
    pad.classList.remove('picking');
    preview();
  }
  field.addEventListener('lostpointercapture', cancelPick);
  window.addEventListener('blur', cancelPick);
  field.addEventListener('keydown', event => {
    const step = event.shiftKey ? 12 : 1;
    const directions = {ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]};
    const change = directions[event.key];
    if (!change && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (change) {
      x = Math.max(0, Math.min(field.width - 1, x + change[0]));
      y = Math.max(0, Math.min(field.height - 1, y + change[1]));
      preview();
    }
    commit(readout.value);
  });
  hue.addEventListener('input', paintField);
  hue.addEventListener('change', () => commit(readout.value));
  clear.addEventListener('click', () => { field.focus({preventScroll: true}); commit(null); });
  paintField();
  mountFloatingRail(rail, 'color pad');
}
