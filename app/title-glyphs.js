import * as THREE from './vendor/three.module.js';

// Trace the occupied pixels clockwise. Keeping separate loops also preserves
// counters and disconnected serifs when a letter crosses a tile boundary.
function contours(alpha, imageWidth, left, top, width, height) {
  const stride = width + 1;
  const edges = new Map();
  const filled = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    && alpha[((top + y) * imageWidth + left + x) * 4 + 3] >= 128;
  function edge(x, y, nx, ny, direction) {
    const key = y * stride + x;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push({end: ny * stride + nx, direction});
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) edge(x, y, x + 1, y, 0);
      if (!filled(x + 1, y)) edge(x + 1, y, x + 1, y + 1, 1);
      if (!filled(x, y + 1)) edge(x + 1, y + 1, x, y + 1, 2);
      if (!filled(x - 1, y)) edge(x, y + 1, x, y, 3);
    }
  }
  const loops = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    let key = start, direction = edges.get(start)[0].direction;
    const points = [];
    do {
      points.push([key % stride, Math.floor(key / stride)]);
      const options = edges.get(key);
      // A right turn keeps diagonally touching islands separate.
      const priority = [1, 0, 3, 2];
      options.sort((a, b) => priority.indexOf((a.direction - direction + 4) % 4)
        - priority.indexOf((b.direction - direction + 4) % 4));
      const next = options.shift();
      if (!options.length) edges.delete(key);
      key = next.end;
      direction = next.direction;
    } while (key !== start);
    const corners = points.filter((point, i) => {
      const before = points[(i + points.length - 1) % points.length];
      const after = points[(i + 1) % points.length];
      return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0]);
    });
    const area = corners.reduce((sum, p, i) => {
      const next = corners[(i + 1) % corners.length];
      return sum + p[0] * next[1] - next[0] * p[1];
    }, 0);
    if (corners.length >= 3) loops.push({points: corners, area});
  }
  return loops;
}

function contains(points, [x, y]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i], [bx, by] = points[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function buildTitleGlyphs(title, word) {
  const style = getComputedStyle(title);
  const {width, height} = title.getBoundingClientRect();
  const fontSize = parseFloat(style.fontSize);
  const padding = fontSize * .22;
  const cell = fontSize * .14;
  const gap = Math.max(1, fontSize * .012);
  const columns = Math.ceil((width + padding * 2) / cell);
  const rows = Math.ceil((height + padding * 2) / cell);
  const viewWidth = columns * cell, viewHeight = rows * cell;
  const density = 3;
  const source = document.createElement('canvas');
  source.width = Math.ceil(viewWidth * density);
  source.height = Math.ceil(viewHeight * density);
  const context = source.getContext('2d', {willReadFrequently: true});
  context.scale(density, density);
  context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  context.letterSpacing = style.letterSpacing;
  context.fontKerning = 'normal';
  context.fillStyle = '#fff';
  const metrics = context.measureText(word);
  const baseline = (parseFloat(style.lineHeight) - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
  context.fillText(word, padding, padding + baseline);
  const alpha = context.getImageData(0, 0, source.width, source.height).data;
  const positions = [], normals = [], centers = [], delays = [];
  const depth = Math.max(1, fontSize * .014);
  let count = 0, lastDelay = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const left = Math.ceil(column * cell * density), top = Math.ceil(row * cell * density);
      const right = Math.floor((column * cell + cell - gap) * density);
      const bottom = Math.floor((row * cell + cell - gap) * density);
      const loops = contours(alpha, source.width, left, top, right - left, bottom - top);
      const cx = (left + right) / (2 * density), cy = (top + bottom) / (2 * density);
      const convert = points => points.map(([x, y]) => new THREE.Vector2((left + x) / density - cx, cy - (top + y) / density));
      const outer = loops.filter(loop => loop.area > 0);
      const shapes = outer.map(loop => new THREE.Shape(convert(loop.points)));
      for (const hole of loops.filter(loop => loop.area < 0)) {
        const parent = outer.findIndex(loop => contains(loop.points, hole.points[0]));
        if (parent >= 0) shapes[parent].holes.push(new THREE.Path(convert(hole.points)));
      }
      if (!shapes.length) continue;
      const part = new THREE.ExtrudeGeometry(shapes, {depth, bevelEnabled: false, steps: 1, curveSegments: 1});
      const delay = (column + row) * 680 / Math.max(1, columns + rows - 2);
      const position = part.getAttribute('position'), normal = part.getAttribute('normal');
      for (let i = 0; i < position.count; i++) {
        positions.push(position.getX(i), position.getY(i), position.getZ(i) - depth);
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        centers.push(cx - viewWidth / 2, viewHeight / 2 - cy, 0);
        delays.push(delay);
      }
      part.dispose();
      count++;
      lastDelay = Math.max(lastDelay, delay);
    }
  }
  if (!count) throw new Error('The title has no visible glyphs');
  // The pieces have different outlines. Batch them in one draw and transform
  // each piece about its own center in the vertex shader.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('tileCenter', new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute('tileDelay', new THREE.Float32BufferAttribute(delays, 1));
  return {geometry, width: viewWidth, height: viewHeight, fontSize, padding, count, lastDelay};
}
