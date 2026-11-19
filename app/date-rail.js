import { mountFloatingRail } from './floating-rail.js';

// Rail 08 uses one vertical track. The latest year is at the top.
export function mountDateRail(rail, years, onRange) {
  const axis = rail.querySelector('.date-axis');
  const track = rail.querySelector('.date-rail');
  const nodes = {upper: rail.querySelector('.end-node'), lower: rail.querySelector('.start-node')};
  const first = years[0];
  const last = years.at(-1);
  const range = {upper: last, lower: first};
  const progress = year => (last - year) / (last - first);
  const ticks = years.map(year => {
    const tick = document.createElement('span');
    tick.className = 'date-tick';
    tick.setAttribute('aria-hidden', 'true');
    tick.classList.toggle('major', year === first || year === last || year % 5 === 0);
    tick.style.top = progress(year) * 100 + '%';
    track.insertBefore(tick, nodes.upper);
    return tick;
  });
  function render() {
    for (const [handle, node] of Object.entries(nodes)) {
      const year = range[handle];
      node.textContent = String(year).slice(-2);
      node.setAttribute('aria-valuenow', year);
      node.setAttribute('aria-valuemin', handle === 'upper' ? range.lower : first);
      node.setAttribute('aria-valuemax', handle === 'lower' ? range.upper : last);
      axis.style.setProperty('--' + handle, progress(year) * 100 + '%');
    }
    axis.setAttribute('aria-label', 'Capture years ' + range.upper + ' to ' + range.lower);
    years.forEach((year, i) => {
      ticks[i].classList.toggle('in-range', year >= range.lower && year <= range.upper);
      ticks[i].classList.toggle('edge', year === range.upper || year === range.lower);
    });
    onRange(range.lower, range.upper);
  }

  function setYear(handle, value) {
    const min = handle === 'upper' ? range.lower : first;
    const max = handle === 'lower' ? range.upper : last;
    const year = Math.max(min, Math.min(max, value));
    if (year === range[handle]) return;
    range[handle] = year;
    render();
  }
  function pointerYear(event) {
    const rect = axis.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return last - Math.round(position * (last - first));
  }
  function nearest(year) {
    if (range.upper === range.lower && year < range.lower) return 'lower';
    return Math.abs(year - range.upper) <= Math.abs(year - range.lower) ? 'upper' : 'lower';
  }

  let sliderDrag;
  function slide(event) {
    const year = pointerYear(event);
    // At a shared stop, the first movement determines which handle can move away.
    if (!sliderDrag.handle && range.upper === range.lower && year === range.upper) return;
    sliderDrag.handle ??= nearest(year);
    axis.dataset.handle = sliderDrag.handle;
    setYear(sliderDrag.handle, year);
  }
  axis.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    axis.focus({preventScroll: true});
    axis.setPointerCapture(event.pointerId);
    sliderDrag = {id: event.pointerId, handle: null};
    slide(event);
  });
  axis.addEventListener('pointermove', event => {
    if (sliderDrag?.id === event.pointerId) slide(event);
  });
  function endSlide() {
    sliderDrag = null;
    delete axis.dataset.handle;
  }
  axis.addEventListener('lostpointercapture', endSlide);
  window.addEventListener('blur', endSlide);
  axis.addEventListener('wheel', event => {
    if (event.ctrlKey || !event.deltaY) return;
    event.preventDefault();
    const handle = nearest(pointerYear(event));
    setYear(handle, range[handle] - Math.sign(event.deltaY));
  }, {passive: false});
  axis.addEventListener('keydown', event => {
    const step = {ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5}[event.key];
    if (!step) return;
    event.preventDefault();
    const handle = event.shiftKey || event.target === nodes.lower ? 'lower' : 'upper';
    setYear(handle, range[handle] + step);
  });

  render();
  mountFloatingRail(rail, 'date range');
}
