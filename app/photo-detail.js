import { imageMetadata } from './image-metadata.js';

// Older imports have a stored eight-color palette. Sample the decoded preview
// for images without one, grouping nearby RGB values before ranking by area.
function sampleColors(image) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (!alpha) continue;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bin = bins.get(key) || {weight: 0, r: 0, g: 0, b: 0};
    bin.weight += alpha;
    bin.r += r * alpha;
    bin.g += g * alpha;
    bin.b += b * alpha;
    bins.set(key, bin);
  }
  return [...bins.values()].sort((a, b) => b.weight - a.weight).slice(0, 8).map(bin =>
    '#' + [bin.r, bin.g, bin.b].map(sum => Math.round(sum / bin.weight).toString(16).padStart(2, '0')).join('').toUpperCase());
}

function renderSwatches(list, colors) {
  const cards = colors.map((hex, index) => {
    const card = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = 'swatch-chip';
    chip.style.backgroundColor = hex;
    const caption = document.createElement('div');
    caption.className = 'swatch-caption';
    const label = document.createElement('strong');
    label.textContent = hex;
    const number = document.createElement('small');
    number.textContent = String(index + 1).padStart(2, '0');
    caption.append(label, number);
    card.append(chip, caption);
    return card;
  });
  list.replaceChildren(...cards);
}

export function photoDetail(dialog) {
  const layout = dialog.querySelector('.photo-layout');
  const panes = [...layout.children];
  const [imagePane, palettePane, metadataPane] = panes;
  const metadata = imageMetadata(metadataPane);
  const list = palettePane.querySelector('.swatch-list');
  const status = document.createElement('p');
  status.className = 'palette-status';
  status.setAttribute('role', 'status');
  palettePane.append(status);
  let selection = 0;

  const nav = dialog.querySelector('.detail-nav');
  for (const [index, label] of ['Image', 'Colors', 'Metadata'].entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      layout.scrollLeft = panes[index].offsetLeft;
      panes[index].focus({preventScroll: true});
    });
    nav.append(button);
  }
  function markCurrentPane() {
    const current = Math.round(layout.scrollLeft / (layout.clientWidth || 1));
    [...nav.children].forEach((button, index) => button.setAttribute('aria-current', String(index === current)));
  }
  layout.addEventListener('scroll', markCurrentPane, {passive: true});
  // For a wide photo the overflow runs horizontally. Let a mouse wheel pan it.
  imagePane.addEventListener('wheel', event => {
    if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    if (imagePane.scrollHeight > imagePane.clientHeight + 1 || imagePane.scrollWidth <= imagePane.clientWidth + 1) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? imagePane.clientWidth : 1;
    imagePane.scrollLeft += event.deltaY * unit;
    event.preventDefault();
  }, {passive: false});

  async function show(photo, image, metadataUrl) {
    const id = ++selection;
    // Keep sampling tied to the source even if a display effect swaps the image.
    const original = new Image();
    original.src = image.src;
    palettePane.hidden = false;
    palettePane.scrollTop = 0;
    imagePane.scrollTop = 0;
    list.replaceChildren();
    status.textContent = 'Sampling colors…';
    markCurrentPane();
    const recordRequest = metadata.show(photo, metadataUrl);
    const decoded = await original.decode().then(() => true, () => false);
    if (id !== selection) return;
    if (decoded) {
      image.style.setProperty('--photo-ratio', original.naturalWidth / original.naturalHeight);
      imagePane.scrollLeft = (imagePane.scrollWidth - imagePane.clientWidth) / 2;
    }
    const record = await recordRequest;
    if (id !== selection) return;
    try {
      const indexed = (photo.palette || record?.['Preview palette']?.palette || []).map(color => color.hex.toUpperCase());
      const colors = indexed.length ? [...new Set(indexed)] : decoded ? sampleColors(original) : [];
      renderSwatches(list, colors);
      status.textContent = colors.length ? '' : 'No colors available for this image.';
    } catch {
      status.textContent = 'Colors could not be sampled from this image.';
    }
  }

  function clear() {
    selection++;
    metadata.clear();
    palettePane.hidden = true;
    list.replaceChildren();
    layout.scrollLeft = 0;
    imagePane.scrollTo(0, 0);
  }
  return {show, clear};
}
