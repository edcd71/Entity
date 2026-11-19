// Keep the real heading for layout and accessibility. Each decorative tile clips
// the same live Geist Serif word, so the strokes stay sharp at every screen size.
export async function mountTiledTitle(title, entranceFinished) {
  const word = title.textContent;
  const ink = () => getComputedStyle(title.closest('.lead-card')).color;
  title.classList.add('title-pending');
  const module = import('./title-three.js').catch(() => null);
  await Promise.all([document.fonts.ready, entranceFinished]);
  const fallback = () => mountFallbackTitle(title, word, ink());
  try {
    const three = await module;
    if (!three) return fallback();
    three.mountThreeTitle(title, {word, ink: ink(), fallback});
  } catch {
    fallback();
  }
}

async function mountFallbackTitle(title, word, ink) {
  let layer;
  let animations = [];
  let previousSize;

  function build(animate) {
    const {width, height} = title.getBoundingClientRect();
    const fontSize = parseFloat(getComputedStyle(title).fontSize);
    const size = [width, height, fontSize].join(':');
    if (!width || !height || size === previousSize) return;
    previousSize = size;
    animations.forEach(animation => animation.cancel());
    animations = [];
    layer?.remove();

    // Include the serifs and descender outside the heading's tight line box.
    const padding = fontSize * .18;
    const cell = fontSize * .14;
    const gap = Math.max(1, fontSize * .012);
    const columns = Math.ceil((width + padding * 2) / cell);
    const rows = Math.ceil((height + padding * 2) / cell);
    layer = document.createElement('span');
    layer.className = 'title-tiles';
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {
      color: getComputedStyle(title.closest('.lead-card')).color || ink, left: -padding + 'px', top: -padding + 'px',
      width: columns * cell + 'px', height: rows * cell + 'px',
    });
    const reduced = title.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const beat = 680 / Math.max(1, columns + rows - 2);
    const start = document.timeline.currentTime;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const tile = document.createElement('span');
        tile.className = 'title-fragment';
        tile.dataset.title = word;
        Object.assign(tile.style, {
          left: column * cell + 'px', top: row * cell + 'px',
          width: cell - gap + 'px', height: cell - gap + 'px',
        });
        tile.style.setProperty('--text-x', padding - column * cell + 'px');
        tile.style.setProperty('--text-y', padding - row * cell + 'px');
        layer.append(tile);
        if (animate) {
          const frames = reduced
            ? [{opacity: 0}, {opacity: 1}]
            : [{transform: 'perspective(260px) rotateY(90deg)', opacity: 0},
              {transform: 'perspective(260px) rotateY(0deg)', opacity: 1}];
          const animation = tile.animate(frames, {
            delay: (column + row) * beat,
            duration: reduced ? 50 : 340,
            easing: reduced ? 'steps(1, end)' : 'cubic-bezier(.22,.68,.3,1)',
            fill: 'backwards',
          });
          animation.startTime = start;
          animations.push(animation);
        }
      }
    }
    title.append(layer);
    title.classList.add('tiled-title');
    title.classList.remove('title-pending');
  }

  try {
    await document.fonts.ready;
    build(true);
    document.addEventListener('entitythemechange', () => {
      if (layer) layer.style.color = getComputedStyle(title.closest('.lead-card')).color;
    });
    // Resizing redraws the settled lettering without replaying the entrance.
    new ResizeObserver(() => build(false)).observe(title);
  } catch {
    animations.forEach(animation => animation.cancel());
    layer?.remove();
    title.classList.remove('title-pending', 'tiled-title');
  }
}
