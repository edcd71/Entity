import { mountDateRail } from './date-rail.js';
import { mountColorPad, hexToLab, rankByColor } from './color-pad.js';
import { photoDetail } from './photo-detail.js';
import { mountTiledTitle } from './title-tiles.js';
import { mountThemeControl } from './theme-control.js';
import { mountGridHover } from './grid-hover.js';
import { mountLocationControl, matchesLocation } from './location-control.js';
import { captureMinute, matchesTime, mountTimeControl, timeRangeLabel } from './time-control.js';
import { buildMoments, matchesMoment } from './moments.js';
import { mountMomentsControl } from './moments-control.js';
import { mountGridEffects } from './grid-effects.js';
import { mountPixelControl } from './pixel-control.js';
import { mountMeadControl } from './mead-control.js';
import { mountDetailEffect } from './detail-effect.js';
import { mountMoebiusControl } from './moebius-control.js';
import { mountWorkspace } from './workspace.js';
import { mountSlideshow } from './slideshow.js';

const grid = document.querySelector('#photos');
const photoList = grid.querySelector('.photo-list');
const leadCard = document.querySelector('.lead-card');
const controls = document.querySelector('.workspace-controls');
const status = document.querySelector('#grid-status');
const viewer = document.querySelector('#photo-viewer');
const detail = photoDetail(viewer);
const fullPhoto = document.querySelector('#full-photo');
const detailEffect = mountDetailEffect(fullPhoto);
const dateFilter = document.querySelector('.date-filter');
const dateSummary = document.querySelector('#date-summary');
const years = [2022, 2023, 2024, 2025, 2026];
const chronological = [];
let ordered = chronological;
let firstYear = years[0], lastYear = years.at(-1);
let locationControl, selectedLocation = null, locationLabel = '', selectedColor = null;
let selectedTime = null;
let momentsControl, selectedMoment = null, momentLabel = '';
let photos = [];
let selected = 0;
let tabStop;
let tileReveals = new Map();
let firstRender = true;
let finishLeadReveal;
const gridHover = mountGridHover(grid, viewer, () => photos);
const gridEffects = mountGridEffects(grid, image => {
  if (image.parentElement.classList.contains('three-hover')) gridHover.reset();
}, controls);
mountWorkspace(document.querySelector('.workspace'), () => gridHover.reset());
const slideshow = mountSlideshow(controls.querySelector('.slideshow-filter'), document.querySelector('#slideshow-viewer'), () => photos, () => gridHover.reset());

function showPhoto(index) {
  const photo = photos[index];
  if (!photo) return;
  gridHover.reset();
  selected = index;
  fullPhoto.src = photo.preview || photo.thumbnail;
  fullPhoto.alt = photo.name;
  if (!viewer.open) viewer.showModal();
  detail.show(photo, fullPhoto);
  detailEffect.show(photo);
}

function focusPhoto(index) {
  const button = photos[index]?.button;
  if (!button) return;
  button.focus({preventScroll: true});
  button.scrollIntoView({block: 'nearest', inline: 'nearest'});
}

grid.addEventListener('focusin', event => {
  const button = event.target.closest('.photo');
  if (!button) return;
  if (tabStop) tabStop.tabIndex = -1;
  button.tabIndex = 0;
  tabStop = button;
});
grid.addEventListener('click', event => {
  const button = event.target.closest('.photo');
  if (button) showPhoto(photos.findIndex(photo => photo.button === button));
});
grid.addEventListener('keydown', event => {
  const index = photos.findIndex(photo => photo.button === event.target);
  if (index === -1) return;
  const rows = Number(getComputedStyle(grid).getPropertyValue('--rows'));
  const last = photos.length - 1;
  const destinations = {
    ArrowLeft: index < rows ? index : index - rows,
    ArrowRight: index >= last - last % rows ? index : Math.min(index + rows, last),
    ArrowUp: index % rows ? index - 1 : index,
    ArrowDown: (index + 1) % rows ? Math.min(index + 1, last) : index,
    Home: 0,
    End: last,
  };
  if (!Object.hasOwn(destinations, event.key)) return;
  event.preventDefault();
  focusPhoto(destinations[event.key]);
});

// Horizontal trackpad gestures and touch swipes use native overflow scrolling.
// A conventional wheel moves along the same axis in pixel, line, or page units.
grid.addEventListener('wheel', event => {
  if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? grid.clientWidth : 1;
  grid.scrollLeft += event.deltaY * unit;
  event.preventDefault();
}, {passive: false});

fullPhoto.addEventListener('click', () => viewer.close());
viewer.addEventListener('close', () => {
  if (viewer.open) return;
  detail.clear();
  detailEffect.clear();
  fullPhoto.removeAttribute('src');
  focusPhoto(selected);
});
viewer.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  showPhoto(selected + (event.key === 'ArrowRight' ? 1 : -1));
});

function revealRangeTiles(includeLead) {
  finishLeadReveal?.();
  const next = new Map();
  const style = getComputedStyle(grid);
  const rows = Number(style.getPropertyValue('--rows'));
  const viewport = grid.getBoundingClientRect();
  const tile = photos[0]?.button.getBoundingClientRect();
  const tileWidth = tile?.width || parseFloat(style.gridAutoColumns);
  const firstColumn = tile ? Math.max(0, Math.floor((viewport.left - tile.left) / tileWidth)) : 0;
  const endColumn = tile ? Math.ceil((viewport.right - tile.left) / tileWidth) : 0;
  const endIndex = Math.min(photos.length, endColumn * rows);
  const columns = Math.ceil(endIndex / rows) - firstColumn;
  const leadColumns = includeLead ? Math.max(1, Math.round(leadCard.clientWidth / tileWidth)) : 0;
  const beat = Math.min(74, 720 / Math.max(1, leadColumns + columns + rows - 2));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timing = {
    duration: reduced ? 50 : 320,
    easing: reduced ? 'steps(1, end)' : 'cubic-bezier(.22,.68,.3,1)',
    fill: 'backwards',
  };
  const start = document.timeline.currentTime;
  let leadFinished;

  if (includeLead) {
    // Black shutters reveal the actual card, including its title and copy.
    // Their rows align with the photos and share the same diagonal timing.
    const cover = document.createElement('div');
    cover.className = 'lead-reveal';
    cover.setAttribute('aria-hidden', 'true');
    cover.style.setProperty('--reveal-columns', leadColumns);
    const animations = [];
    const frames = reduced
      ? [{opacity: 1}, {opacity: 0}]
      : [{transform: 'scaleX(1)'}, {transform: 'scaleX(0)'}];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < leadColumns; column++) {
        const shutter = document.createElement('span');
        cover.append(shutter);
        const animation = shutter.animate(frames, {
          ...timing, delay: (column + row) * beat, fill: 'both',
        });
        animation.startTime = start;
        animations.push(animation);
      }
    }
    leadCard.append(cover);
    const finish = () => {
      cover.remove();
      animations.forEach(animation => animation.cancel());
      window.removeEventListener('resize', finish);
      if (finishLeadReveal === finish) finishLeadReveal = undefined;
    };
    finishLeadReveal = finish;
    window.addEventListener('resize', finish, {once: true});
    leadFinished = Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
  }
  document.documentElement.classList.remove('grid-loading');

  if (photos.length) {
    const frames = reduced
      ? [{opacity: 0}, {opacity: 1}]
      : [{transform: 'perspective(560px) rotateY(90deg)'}, {transform: 'perspective(560px) rotateY(0deg)'}];

    for (let i = firstColumn * rows; i < endIndex; i++) {
      const image = photos[i].button.firstElementChild;
      const column = leadColumns + Math.floor(i / rows) - firstColumn;
      const delay = (column + i % rows) * beat;
      // A shared thumbnail can finish its entrance while the handle crosses another year.
      const current = tileReveals.get(image);
      const animation = current?.playState === 'running' ? current : image.animate(frames, {...timing, delay});
      if (animation !== current) animation.startTime = start;
      next.set(image, animation);
    }
  }
  for (const [image, animation] of tileReveals) {
    if (!next.has(image)) animation.cancel();
  }
  tileReveals = next;
  if (includeLead) {
    const entranceFinished = Promise.allSettled([leadFinished, ...[...next.values()].map(animation => animation.finished)]);
    mountTiledTitle(leadCard.querySelector('h1'), entranceFinished);
  }
}

function renderGrid() {
  gridHover.reset();
  dateSummary.textContent = firstYear === lastYear ? String(firstYear) : firstYear + ' – ' + lastYear;
  if (tabStop) tabStop.tabIndex = -1;
  const inRange = photo => photo.year >= firstYear && photo.year <= lastYear && matchesTime(photo.minute, selectedTime);
  photos = ordered.filter(photo => inRange(photo) && matchesLocation(photo, selectedLocation) && matchesMoment(photo, selectedMoment));
  momentsControl?.update(photo => inRange(photo) && matchesLocation(photo, selectedLocation));
  locationControl?.update(firstYear, lastYear, photo => matchesTime(photo.minute, selectedTime) && matchesMoment(photo, selectedMoment), (selectedTime ? 'selected date and time range' : 'selected date range') + (selectedMoment ? ' and moment' : ''));
  const order = selectedColor ? 'sorted by closest color to ' + selectedColor : 'in capture order';
  grid.setAttribute('aria-label', 'Images ' + order + (selectedLocation ? ', filtered to ' + locationLabel : '') + (selectedTime ? ', captured from ' + timeRangeLabel(selectedTime) : '') + (selectedMoment ? ', moment: ' + momentLabel : '') + '. Use the arrow keys to browse.');
  photoList.replaceChildren(...photos.map(photo => photo.button));
  gridEffects.refresh();
  tabStop = photos[0]?.button;
  if (tabStop) tabStop.tabIndex = 0;
  grid.scrollLeft = 0;
  status.textContent = photos.length
    ? photos.length.toLocaleString() + (photos.length === 1 ? ' image' : ' images')
    : selectedTime || selectedMoment ? 'No images match these filters.' : selectedLocation ? 'No images match this place and date range.' : 'No images in this date range.';
  slideshow.updateCount(photos.length);
  revealRangeTiles(firstRender);
  firstRender = false;
}

async function loadPhotos() {
  try {
    const response = await fetch('/media/grid/index.json');
    if (!response.ok) throw new Error('Image index unavailable');
    for (const photo of await response.json()) {
      const year = Number(photo.capturedAt?.slice(0, 4));
      if (!years.includes(year)) continue;
      const button = document.createElement('button');
      button.className = 'photo';
      button.type = 'button';
      button.tabIndex = -1;
      const image = document.createElement('img');
      image.alt = photo.name;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.draggable = false;
      image.src = photo.thumbnail;
      button.append(image);
      const labColors = (photo.palette || []).map(color => hexToLab(color.hex));
      chronological.push({...photo, year, minute: captureMinute(photo.capturedAt), labColors, button});
    }
    gridEffects.register(chronological);
    const moments = buildMoments(chronological);
    for (const moment of moments) for (const photo of moment.photos) photo.momentId = moment.id;
    momentsControl = mountMomentsControl(controls.querySelector('.moments-filter'), moments, (moment, label) => {
      selectedMoment = moment;
      momentLabel = label;
      renderGrid();
    });
    locationControl = mountLocationControl(controls.querySelector('.location-filter'), chronological, (location, label) => {
      selectedLocation = location;
      locationLabel = label;
      renderGrid();
    });
    mountTimeControl(controls.querySelector('.time-filter'), range => {
      selectedTime = range;
      renderGrid();
    });
    mountDateRail(dateFilter, years, (first, last) => {
      firstYear = first;
      lastYear = last;
      renderGrid();
    });
    mountColorPad(controls.querySelector('.color-filter'), hex => {
      selectedColor = hex;
      ordered = hex ? rankByColor(chronological, hex) : chronological;
      renderGrid();
    });
  } catch {
    finishLeadReveal?.();
    document.documentElement.classList.remove('grid-loading');
    status.textContent = 'The photo grid could not load. Reload to try again.';
    slideshow.updateCount(0);
  }
}

mountThemeControl(controls.querySelector('.theme-filter'));
mountPixelControl(controls.querySelector('.pixel-filter'), settings => {
  gridHover.reset();
  gridEffects.setPixel(settings);
});
mountMeadControl(controls.querySelector('.mead-filter'), settings => {
  gridHover.reset();
  gridEffects.setMead(settings);
  detailEffect.setMead(settings);
});
mountMoebiusControl(controls.querySelector('.moebius-filter'), settings => {
  gridHover.reset();
  gridEffects.setMoebius(settings);
});
loadPhotos();
