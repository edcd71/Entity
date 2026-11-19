const storageKey = 'entity-workspace';

export function mountWorkspace(workspace, onLayoutChange) {
  const splitter = workspace.querySelector('.workspace-splitter');
  const card = workspace.querySelector('.lead-card');
  const scroll = workspace.querySelector('.control-scroll');
  const compact = matchMedia('(max-width: 800px)');
  let width = Math.min(480, innerWidth * .31), docked = compact.matches, restoredWidth = width;
  let drag, suppressClick = false, saved;
  const limit = () => compact.matches ? innerWidth - 36 : Math.max(160, Math.min(600, innerWidth - 176 - 120));
  const minimum = () => Math.min(240, limit());
  width = restoredWidth = Math.max(minimum(), Math.min(limit(), width));
  try {saved = JSON.parse(localStorage.getItem(storageKey));} catch {}
  if (saved && typeof saved.docked === 'boolean') {
    docked = saved.docked;
    if (Number.isFinite(saved.width)) width = Math.max(minimum(), Math.min(limit(), saved.width));
    restoredWidth = width;
  }
  let preferredDocked = saved?.docked === true;
  function paint() {
    width = Math.max(0, Math.min(limit(), width));
    workspace.dataset.cardState = docked ? 'docked' : 'open';
    workspace.style.setProperty('--card-width', width + 'px');
    card.inert = docked;
    card.setAttribute('aria-hidden', String(docked));
    // On a phone the title returns as a drawer, keeping the controls usable at
    // their normal width once it is dismissed instead of squeezing the grid.
    workspace.querySelector('.workspace-controls').inert = compact.matches && !docked;
    workspace.querySelector('#photos').inert = compact.matches && !docked;
    splitter.setAttribute('aria-valuemax', String(Math.round(limit())));
    splitter.setAttribute('aria-valuenow', String(docked ? 0 : Math.round(width)));
    splitter.setAttribute('aria-valuetext', docked ? 'Title card hidden; controls docked left' : `Title card ${Math.round(width)} pixels wide`);
    splitter.setAttribute('aria-label', docked ? 'Restore title card' : 'Resize or hide title card');
    onLayoutChange();
  }
  function save() {
    preferredDocked = docked;
    try {localStorage.setItem(storageKey, JSON.stringify({docked, width: restoredWidth}));} catch {}
  }
  function settle(nextWidth) {
    docked = nextWidth < minimum() * .55;
    if (!docked) width = restoredWidth = Math.max(minimum(), Math.min(limit(), nextWidth));
    workspace.classList.remove('resizing');
    paint(); save();
  }
  function toggle() {
    if (docked) settle(restoredWidth);
    else {restoredWidth = width; settle(0);}
  }
  splitter.addEventListener('click', () => {
    if (suppressClick) {suppressClick = false; return;}
    toggle();
  });
  splitter.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    splitter.focus({preventScroll: true});
    suppressClick = false;
    drag = {id: event.pointerId, x: event.clientX, width: docked ? 0 : width, docked, moved: false};
    splitter.setPointerCapture(event.pointerId);
  });
  splitter.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    if (!drag.moved && Math.abs(delta) < 5) return;
    drag.moved = true;
    workspace.classList.add('resizing');
    width = Math.max(0, Math.min(limit(), drag.width + delta));
    docked = width === 0;
    paint();
  });
  function finish(cancelled = false) {
    if (!drag) return;
    const previous = drag; drag = null;
    suppressClick = previous.moved;
    if (cancelled) {width = previous.width || restoredWidth; docked = previous.docked; workspace.classList.remove('resizing'); paint();}
    else if (previous.moved) settle(width);
  }
  splitter.addEventListener('pointerup', () => finish());
  splitter.addEventListener('pointercancel', () => finish(true));
  splitter.addEventListener('lostpointercapture', () => finish(true));
  splitter.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) {event.preventDefault(); finish(true); return;}
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') {if (!docked) restoredWidth = width; settle(0);}
    else if (event.key === 'End') settle(restoredWidth);
    else if (event.key === 'ArrowLeft') settle(docked || width <= minimum() ? 0 : width - (event.shiftKey ? 80 : 24));
    else settle(docked ? restoredWidth : width + (event.shiftKey ? 80 : 24));
  });
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('resize', () => {finish(true); paint();});
  compact.addEventListener('change', () => {docked = compact.matches || preferredDocked; width = Math.min(limit(), restoredWidth); paint();});
  // Layout changes also include a tool opening, collapsing, or floating away.
  new ResizeObserver(onLayoutChange).observe(workspace.querySelector('#photos'));
  // After the spring settles, expose the opened panel within its own scroller.
  scroll.addEventListener('transitionend', event => {
    const rail = event.target;
    if (event.propertyName !== 'height' || !rail.matches('.control-rail:not(.collapsed):not([popover])')) return;
    const box = rail.getBoundingClientRect(), viewport = scroll.getBoundingClientRect();
    if (box.bottom > viewport.bottom - 16) scroll.scrollTop += Math.min(box.top - viewport.top - 16, box.bottom - viewport.bottom + 16);
    else if (box.top < viewport.top) scroll.scrollTop += box.top - viewport.top - 16;
  });
  paint();
}
