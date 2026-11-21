import { mountFloatingRail } from './floating-rail.js';

export function mountSlideshow(rail, dialog, getPhotos, onOpen) {
  mountFloatingRail(rail, 'slideshow control');
  const start = rail.querySelector('.slideshow-start');
  const count = rail.querySelector('.slideshow-count');
  const stage = dialog.querySelector('.slideshow-stage');
  const image = stage.querySelector('img');
  const status = stage.querySelector('.slideshow-image-status');
  const filename = dialog.querySelector('.slideshow-filename');
  const date = dialog.querySelector('time');
  const close = dialog.querySelector('.slideshow-close');
  const previous = dialog.querySelector('.slideshow-previous');
  const next = dialog.querySelector('.slideshow-next');
  const play = dialog.querySelector('.slideshow-play');
  const number = dialog.querySelector('.slideshow-pagination input');
  const total = dialog.querySelector('.slideshow-total');
  const pace = dialog.querySelector('.slideshow-settings select');
  const loop = dialog.querySelector('.slideshow-settings input');
  const strip = dialog.querySelector('.slideshow-strip');
  const progress = dialog.querySelector('.slideshow-progress');
  let photos = [], index = 0, playing = false;
  let timer, progressTimer, progressStartedAt = 0, progressElapsed = 0;
  let revision = 0, editingNumber = false;

  const thumbnails = Array.from({length: 5}, () => {
    const button = document.createElement('button');
    button.type = 'button';
    const thumbnail = document.createElement('img');
    thumbnail.alt = '';
    thumbnail.decoding = 'async';
    button.append(thumbnail);
    strip.append(button);
    return button;
  });

  function updateCount(length) {
    start.disabled = length === 0;
    count.textContent = length ? `${length.toLocaleString()} ${length === 1 ? 'photo' : 'photos'}` : 'No photos to play';
  }

  function updateTransport() {
    const canMove = photos.length > 1;
    const action = playing ? 'Pause' : 'Play';
    play.disabled = !canMove;
    play.textContent = action;
    play.setAttribute('aria-label', `${action} slideshow`);
    play.title = `${action} slideshow (Space)`;
    previous.disabled = !canMove || (index === 0 && !loop.checked);
    next.disabled = !canMove || (index === photos.length - 1 && !loop.checked);
  }

  function updatePagination() {
    if (!editingNumber) number.value = index + 1;
    const first = Math.max(0, Math.min(index - 2, photos.length - thumbnails.length));
    thumbnails.forEach((button, offset) => {
      const position = first + offset;
      const photo = photos[position];
      button.hidden = !photo;
      if (!photo) {
        button.removeAttribute('aria-current');
        button.firstElementChild.removeAttribute('src');
        return;
      }
      button.dataset.index = position;
      button.setAttribute('aria-label', `Photo ${position + 1}: ${photo.name}`);
      button.setAttribute('aria-current', position === index ? 'true' : 'false');
      button.firstElementChild.src = photo.thumbnail;
    });
  }

  function applyPalette(photo) {
    const colors = (photo.palette || []).map(color => color.hex).filter(color => /^#[\da-f]{6}$/i.test(color));
    if (!colors.length) {
      dialog.style.removeProperty('--slideshow-accent');
      dialog.style.removeProperty('--slideshow-accent-ink');
      dialog.style.removeProperty('--slideshow-swatches');
      return;
    }
    const [red, green, blue] = colors[0].slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    dialog.style.setProperty('--slideshow-accent', colors[0]);
    dialog.style.setProperty('--slideshow-accent-ink', luminance > 0.38 ? '#151517' : '#fff');
    dialog.style.setProperty('--slideshow-swatches', `linear-gradient(90deg, ${colors.join(', ')})`);
  }

  function schedule() {
    if (progressStartedAt) {
      progressElapsed += performance.now() - progressStartedAt;
      progressStartedAt = 0;
    }
    clearTimeout(timer);
    clearInterval(progressTimer);
    const duration = Number(pace.value) * 1000;
    progress.value = Math.min(progressElapsed / duration, 1);
    if (!dialog.open || !playing || document.hidden || stage.dataset.imageState === 'loading') return;
    const remaining = Math.max(0, duration - progressElapsed);
    progressStartedAt = performance.now();
    progressTimer = setInterval(() => {
      progress.value = Math.min((progressElapsed + performance.now() - progressStartedAt) / duration, 1);
    }, 50);
    timer = setTimeout(() => {
      if (!dialog.open || document.hidden) return;
      clearInterval(progressTimer);
      progressStartedAt = 0;
      progressElapsed = 0;
      progress.value = 1;
      if (index === photos.length - 1 && !loop.checked) setPlaying(false);
      else step(1);
    }, remaining);
  }

  function setPlaying(value) {
    playing = value && photos.length > 1;
    updateTransport();
    schedule();
  }

  async function showPhoto(position) {
    if (!dialog.open || !photos[position]) return;
    clearTimeout(timer);
    const request = ++revision;
    index = position;
    const photo = photos[index];
    applyPalette(photo);
    filename.textContent = photo.name;
    filename.title = photo.name;
    date.dateTime = date.textContent = photo.capturedAt.slice(0, 10);
    image.alt = photo.name;
    stage.dataset.imageState = 'loading';
    progressElapsed = 0;
    progressStartedAt = 0;
    progress.value = 0;
    status.hidden = false;
    status.textContent = 'Loading photo…';
    updatePagination();
    updateTransport();

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
      schedule();
      return;
    }
    stage.dataset.imageState = 'error';
    status.textContent = 'This photo could not load.';
    schedule();
  }

  function step(direction) {
    if (photos.length < 2) return;
    const position = index + direction;
    showPhoto(loop.checked ? (position + photos.length) % photos.length : position);
  }

  function togglePlayback() {
    if (photos.length < 2) return;
    setPlaying(!playing);
    if (playing && index === photos.length - 1 && !loop.checked) showPhoto(0);
  }

  function jump() {
    if (!editingNumber) return;
    editingNumber = false;
    const value = number.valueAsNumber;
    if (dialog.open && Number.isFinite(value)) {
      const position = Math.max(0, Math.min(photos.length - 1, Math.round(value) - 1));
      if (position !== index) showPhoto(position);
    }
    number.value = index + 1;
  }

  start.addEventListener('click', () => {
    if (dialog.open) return;
    photos = getPhotos().slice();
    if (!photos.length) return;
    onOpen();
    index = 0;
    editingNumber = false;
    number.max = photos.length;
    number.disabled = photos.length === 1;
    total.textContent = photos.length.toLocaleString();
    playing = photos.length > 1;
    updateTransport();
    dialog.showModal();
    if (play.disabled) close.focus();
    showPhoto(0);
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearTimeout(timer);
    clearInterval(progressTimer);
    revision++;
    playing = false;
    photos = [];
    image.removeAttribute('src');
    progressElapsed = 0;
    progress.value = 0;
    updatePagination();
  });
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  play.addEventListener('click', togglePlayback);
  number.addEventListener('input', () => { editingNumber = true; });
  number.addEventListener('change', jump);
  number.addEventListener('blur', jump);
  number.addEventListener('keydown', event => {
    if (event.key === 'Enter') jump();
  });
  strip.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const position = Number(button.dataset.index);
    if (position !== index) showPhoto(position);
    strip.querySelector('[aria-current="true"]')?.focus({preventScroll: true});
  });
  pace.addEventListener('change', schedule);
  loop.addEventListener('change', updateTransport);
  document.addEventListener('visibilitychange', schedule);
  dialog.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, select')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === ' ' && !event.target.closest('button')) {
      event.preventDefault();
      if (!event.repeat) togglePlayback();
    }
  });

  return {updateCount};
}
