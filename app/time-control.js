import {mountFloatingRail} from './floating-rail.js';

const day = 1440;
const wrap = value => ((value % day) + day) % day;
const svgNS = 'http://www.w3.org/2000/svg';

// Read the camera's clock directly, without converting it to the browser's zone.
export function captureMinute(date) {
  const match = typeof date === 'string' && date.match(/^\d{4}[-:]\d{2}[-:]\d{2}[ T]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function matchesTime(minute, range) {
  if (!range || range.start === range.end) return true;
  if (!Number.isFinite(minute) || minute < 0 || minute >= day) return false;
  return range.start < range.end
    ? minute >= range.start && minute <= range.end
    : minute >= range.start || minute <= range.end;
}

export function formatTime(minute) {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
}

export function timeRangeLabel(range) {
  if (!range || range.start === range.end) return 'All day';
  return formatTime(range.start) + ' to ' + formatTime(range.end) + (range.start > range.end ? ', across midnight' : '');
}

export function mountTimeControl(rail, onFilter) {
  const clock = rail.querySelector('.time-clock');
  const arc = rail.querySelector('.time-arc');
  const ticks = rail.querySelector('.time-ticks');
  const summary = rail.querySelector('.time-summary');
  const reset = rail.querySelector('.time-reset');
  const handles = {start: rail.querySelector('.time-start'), end: rail.querySelector('.time-end')};
  const values = {start: rail.querySelector('.time-start-value'), end: rail.querySelector('.time-end-value')};
  const leaders = {start: rail.querySelector('.time-start-leader'), end: rail.querySelector('.time-end-leader')};
  let range = {start: 0, end: 0}, drag;

  function position(minute, radius = 82) {
    const angle = minute / day * Math.PI * 2;
    return {x: 120 + Math.sin(angle) * radius, y: 120 - Math.cos(angle) * radius};
  }
  for (let hour = 0; hour < 24; hour++) {
    const line = document.createElementNS(svgNS, 'line');
    const major = hour % 6 === 0;
    const a = position(hour * 60, major ? 94 : 97), b = position(hour * 60, 101);
    for (const [key, value] of Object.entries({x1: a.x, y1: a.y, x2: b.x, y2: b.y})) line.setAttribute(key, value);
    if (major) line.classList.add('major');
    ticks.append(line);
  }

  function render() {
    const full = range.start === range.end;
    const a = position(range.start), b = position(range.end);
    const opposite = position(wrap(range.start + 720));
    arc.setAttribute('d', full
      ? `M ${a.x} ${a.y} A 82 82 0 1 1 ${opposite.x} ${opposite.y} A 82 82 0 1 1 ${a.x} ${a.y}`
      : `M ${a.x} ${a.y} A 82 82 0 ${wrap(range.end - range.start) > 720 ? 1 : 0} 1 ${b.x} ${b.y}`);
    const scale = clock.clientWidth / 240 || 1;
    const points = {start: {x: a.x * scale, y: a.y * scale}, end: {x: b.x * scale, y: b.y * scale}};
    const dx = points.end.x - points.start.x, dy = points.end.y - points.start.y;
    const distance = Math.hypot(dx, dy);
    // Separate nearby handles, including the full-day midnight pair. Their
    // leaders retain the exact positions on the dial and both targets stay 44px.
    if (distance < 44) {
      const angle = range.start / day * Math.PI * 2;
      const ux = distance > .01 ? dx / distance : Math.cos(angle);
      const uy = distance > .01 ? dy / distance : Math.sin(angle);
      const shift = (44 - distance) / 2;
      points.start.x -= ux * shift; points.start.y -= uy * shift;
      points.end.x += ux * shift; points.end.y += uy * shift;
    }
    for (const key of ['start', 'end']) {
      const actual = key === 'start' ? a : b;
      const point = points[key];
      const handle = handles[key];
      handle.style.left = point.x + 'px';
      handle.style.top = point.y + 'px';
      handle.setAttribute('aria-valuenow', range[key]);
      handle.setAttribute('aria-valuetext', formatTime(range[key]) + (full ? ', all day' : ''));
      const leader = leaders[key];
      for (const [attr, value] of Object.entries({x1: actual.x, y1: actual.y, x2: point.x / scale, y2: point.y / scale})) leader.setAttribute(attr, value);
      values[key].textContent = full && key === 'end' && range.end === 0 ? '24:00' : formatTime(range[key]);
    }
    summary.textContent = full ? 'All day' : range.start > range.end ? 'Across midnight' : 'Recorded time';
    reset.disabled = full;
    rail.toggleAttribute('data-filtered', !full);
    rail.setAttribute('aria-description', timeRangeLabel(range));
    clock.setAttribute('aria-description', timeRangeLabel(range));
  }
  function commit() { onFilter(range.start === range.end ? null : {...range}); }
  function pointerMinute(event) {
    const rect = clock.getBoundingClientRect();
    const angle = Math.atan2(event.clientX - rect.left - rect.width / 2, rect.top + rect.height / 2 - event.clientY);
    return wrap(Math.round(angle / (Math.PI * 2) * day / 15) * 15);
  }
  function preview(event) {
    range[drag.key] = pointerMinute(event);
    render();
  }
  clock.addEventListener('pointerdown', event => {
    if (drag || !event.isPrimary || event.button !== 0) return;
    let key = event.target.closest('.time-handle')?.dataset.handle;
    if (!key) {
      const rect = clock.getBoundingClientRect();
      const radius = Math.hypot(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
      if (Math.abs(radius - rect.width * 82 / 240) > 24) return;
      const minute = pointerMinute(event);
      const distance = value => Math.min(wrap(value - minute), wrap(minute - value));
      key = distance(range.start) < distance(range.end) ? 'start' : 'end';
    }
    event.preventDefault();
    handles[key].focus({preventScroll: true});
    drag = {id: event.pointerId, key, before: {...range}, x: event.clientX, y: event.clientY, moved: false};
    clock.setPointerCapture(event.pointerId);
    clock.dataset.dragging = key;
    // A handle press preserves its value, especially when its hit target has
    // been offset to separate an overlapping pair. A track press picks a time.
    if (!event.target.closest('.time-handle')) { drag.moved = true; preview(event); }
  });
  clock.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
    drag.moved = true;
    preview(event);
  });
  clock.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.id) return;
    if (drag.moved) preview(event);
    const changed = range.start !== drag.before.start || range.end !== drag.before.end;
    drag = null;
    delete clock.dataset.dragging;
    if (changed) commit();
  });
  function cancel() {
    if (!drag) return;
    range = drag.before;
    drag = null;
    delete clock.dataset.dragging;
    render();
  }
  clock.addEventListener('pointercancel', cancel);
  clock.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', cancel);
  for (const [key, handle] of Object.entries(handles)) {
    handle.addEventListener('keydown', event => {
      if (event.key === 'Escape') { cancel(); return; }
      const step = event.shiftKey ? 15 : 1;
      const change = {ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 60, PageDown: -60}[event.key];
      if (!change && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      cancel();
      range[key] = event.key === 'Home' ? 0 : event.key === 'End' ? day - 1 : wrap(range[key] + change);
      render();
      commit();
    });
  }
  reset.addEventListener('click', () => {
    cancel();
    range = {start: 0, end: 0};
    render();
    commit();
    handles.start.focus({preventScroll: true});
  });
  new ResizeObserver(render).observe(clock);
  render();
  mountFloatingRail(rail, 'time of day');
}
