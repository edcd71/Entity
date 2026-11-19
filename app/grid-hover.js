// Load one renderer on the first mouse/pen hover. Touch keeps native scrolling
// and tapping; the real image buttons remain the interaction targets throughout.
export function mountGridHover(grid, viewer, getPhotos) {
  let runtime, pending, unavailable = false, point;
  let pointerX, pointerY, resumeAfter = 0;

  function reset() {
    point = null;
    runtime?.reset();
  }
  function scroll() {
    // Wheel and momentum events can interleave with pointer moves. Keep the
    // native grid visible throughout, then require a fresh pointer movement.
    resumeAfter = performance.now() + 180;
    reset();
  }
  async function move(event) {
    const moved = event.clientX !== pointerX || event.clientY !== pointerY;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (event.pointerType === 'touch' || event.buttons || viewer.open) { reset(); return; }
    // Browsers can also dispatch pointermove when scrolled content changes the
    // hit target beneath a stationary cursor. That must not restart the effect.
    if (!moved || performance.now() < resumeAfter) return;
    const button = event.target.closest('.photo');
    if (!button || !grid.contains(button)) { leave(); return; }
    const next = point = {x: event.clientX, y: event.clientY, button};
    if (unavailable) return;
    if (!runtime) {
      pending ??= import('./grid-hover-three.js').then(module => {
        runtime = module.createGridHover(grid, getPhotos, () => { unavailable = true; runtime = null; });
      }).catch(() => { unavailable = true; });
      await pending;
    }
    if (point !== next || !runtime || !button.isConnected) return;
    const entrance = button.firstElementChild.getAnimations();
    if (entrance.length) await Promise.allSettled(entrance.map(animation => animation.finished));
    if (point === next && !viewer.open) runtime?.move(next);
  }
  function leave() { point = null; runtime?.leave(); }
  function loaded(event) {
    if (point && event.target.matches('.photo img')) runtime?.move(point);
  }
  grid.addEventListener('pointermove', move);
  grid.addEventListener('pointerleave', leave);
  grid.addEventListener('pointerdown', reset);
  grid.addEventListener('keydown', reset);
  grid.addEventListener('scroll', scroll, {passive: true});
  grid.addEventListener('wheel', scroll, {passive: true});
  grid.addEventListener('load', loaded, true);
  window.addEventListener('resize', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('pagehide', event => {
    reset();
    if (!event.persisted) runtime?.dispose();
  });
  return {reset};
}
