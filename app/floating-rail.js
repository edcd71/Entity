export function mountFloatingRail(rail, name) {
  const toggle = rail.querySelector('.rail-toggle');
  const holdRing = toggle.querySelector('.rail-hold-ring circle');
  const body = rail.querySelector('.rail-body');
  function toggleOpen() {
    const collapsed = rail.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.title = (collapsed ? 'Long press to open ' : 'Long press to close ') + name;
    toggle.setAttribute('aria-label', toggle.title);
    body.inert = collapsed;
  }
  const holdDuration = 540;
  let timer, holdAnimation, heldPointer = null;
  function cancelHold() {
    clearTimeout(timer);
    holdAnimation?.cancel();
    heldPointer = null;
  }
  toggle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || heldPointer !== null) return;
    heldPointer = event.pointerId;
    toggle.focus({preventScroll: true});
    toggle.setPointerCapture(event.pointerId);
    holdAnimation = holdRing.animate([{strokeDashoffset: '1'}, {strokeDashoffset: '0'}],
      {duration: holdDuration, easing: 'linear', fill: 'forwards'});
    timer = setTimeout(() => {
      holdAnimation.finish();
      toggleOpen();
    }, holdDuration);
  });
  toggle.addEventListener('pointermove', event => {
    if (event.pointerId !== heldPointer) return;
    const r = toggle.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) cancelHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) {
    toggle.addEventListener(type, event => { if (event.pointerId === heldPointer) cancelHold(); });
  }
  window.addEventListener('blur', cancelHold);
  // Keyboard and assistive activation do not generate a pointer hold.
  toggle.addEventListener('click', event => {
    if (event.detail === 0) { cancelHold(); toggleOpen(); }
  });

  function place(x, y) {
    rail.style.setProperty('--x', x + 'px');
    rail.style.setProperty('--y', y + 'px');
    if (!rail.hasAttribute('popover')) {
      // Lift the control out of its scrolling surface without moving focused elements.
      rail.popover = 'manual';
      rail.showPopover();
    }
  }
  let drag;
  rail.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('.rail-toggle, [data-rail-input]')) return;
    if (rail.closest('.workspace-controls') && !rail.hasAttribute('popover') && !event.target.closest('.rail-grip')) return;
    const bounds = rail.getBoundingClientRect();
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top};
    rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!rail.classList.contains('moving') && Math.hypot(dx, dy) < 4) return;
    rail.classList.add('moving');
    place(drag.left + dx, drag.top + dy);
  });
  function endDrag() {
    drag = null;
    rail.classList.remove('moving');
  }
  rail.addEventListener('lostpointercapture', event => { if (event.target === rail) endDrag(); });
  window.addEventListener('blur', endDrag);
  rail.querySelector('.rail-grip').addEventListener('keydown', event => {
    const offset = {ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16]}[event.key];
    if (!offset) return;
    event.preventDefault();
    const {x, y} = rail.getBoundingClientRect();
    place(x + offset[0], y + offset[1]);
  });
  rail.disabled = false;
}
