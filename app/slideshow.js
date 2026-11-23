import {mountFloatingRail} from './floating-rail.js';

export function mountSlideshow(rail, dialog, getPhotos, onOpen) {
  mountFloatingRail(rail, 'slideshow control');
  const start = rail.querySelector('.slideshow-start');
  const stage = dialog.querySelector('.slideshow-stage');
  const image = stage.querySelector('img');
  const status = stage.querySelector('.slideshow-image-status');
  const progress = stage.querySelector('.slideshow-progress');
  const progressValue = progress.querySelector('.slideshow-progress-value');
  let photos = [], index = 0, playing = false, timer, progressTimer, startedAt = 0, elapsed = 0, revision = 0;

  function applyPalette(photo) {
    const colors = (photo.palette || []).map(color => color.hex).filter(color => /^#[\da-f]{6}$/i.test(color));
    if (!colors.length) {
      dialog.style.removeProperty('--slideshow-accent');
      dialog.style.removeProperty('--slideshow-secondary');
      dialog.style.removeProperty('--slideshow-accent-ink');
      return;
    }

    const [red, green, blue] = colors[0].slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    dialog.style.setProperty('--slideshow-accent', colors[0]);
    dialog.style.setProperty('--slideshow-secondary', colors[1] || colors[0]);
    dialog.style.setProperty('--slideshow-accent-ink', luminance > 0.38 ? '#151517' : '#fff');
  }

  async function showPhoto(position) {
    if (!dialog.open || !photos[position]) return;
    clearTimeout(timer);
    clearInterval(progressTimer);
    startedAt = 0;
    elapsed = 0;
    updateProgress(0);
    const request = ++revision;
    index = position;
    const photo = photos[index];
    applyPalette(photo);
    image.alt = photo.name;
    stage.dataset.imageState = 'loading';
    status.hidden = false;
    status.textContent = 'Loading photo…';

    for (const source of new Set([photo.preview, photo.thumbnail])) {
      if (!source) continue;
      image.src = source;
      try {
        await image.decode();
      } catch {
        if (request !== revision || !dialog.open) return;
        continue;
      }
      if (request !== revision || !dialog.open) return;
      stage.dataset.imageState = 'ready';
      status.hidden = true;
      scheduleNext();
      return;
    }

    stage.dataset.imageState = 'error';
    status.textContent = 'This photo could not load.';
    scheduleNext();
  }

  function scheduleNext() {
    if (startedAt) {
      elapsed += performance.now() - startedAt;
      startedAt = 0;
    }
    clearTimeout(timer);
    clearInterval(progressTimer);
    if (!dialog.open || !playing || document.hidden || stage.dataset.imageState === 'loading') return;
    const remaining = Math.max(0, 4000 - elapsed);
    startedAt = performance.now();
    const update = () => updateProgress(Math.min((elapsed + performance.now() - startedAt) / 4000, 1));
    update();
    progressTimer = setInterval(update, 50);
    timer = setTimeout(() => {
      clearInterval(progressTimer);
      startedAt = 0;
      elapsed = 0;
      updateProgress(1);
      if (index === photos.length - 1) {
        dialog.close();
      } else {
        showPhoto(index + 1);
      }
    }, remaining);
  }

  function updateProgress(value) {
    const percent = Math.round(value * 100);
    progress.style.setProperty('--progress', percent);
    progress.setAttribute('aria-valuenow', percent);
    progressValue.style.strokeDashoffset = String(100 - percent);
  }

  function turnOn() {
    if (dialog.open) return;
    photos = getPhotos().slice();
    if (!photos.length) return;
    onOpen();
    index = 0;
    playing = true;
    dialog.showModal();
    showPhoto(index);
  }

  start.textContent = 'On';
  start.addEventListener('click', turnOn);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    clearTimeout(timer);
    clearInterval(progressTimer);
    revision++;
    playing = false;
    photos = [];
    image.removeAttribute('src');
    startedAt = 0;
    elapsed = 0;
    updateProgress(0);
    start.focus({preventScroll: true});
  });
  document.addEventListener('visibilitychange', scheduleNext);

  return {updateCount(length) { start.disabled = length === 0; }};
}
