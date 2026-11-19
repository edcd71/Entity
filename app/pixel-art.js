// Adaptive, per-photo palettes keep recognizable colors while limiting the art
// to a small number of flat tones. This only changes in-memory thumbnails.
export function quantizePixels(pixels, limit) {
  const histogram = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const key = (pixels[i] >> 3) << 10 | (pixels[i + 1] >> 3) << 5 | pixels[i + 2] >> 3;
    const color = histogram.get(key) || {sum: [0, 0, 0], count: 0};
    for (let c = 0; c < 3; c++) color.sum[c] += pixels[i + c];
    color.count++;
    histogram.set(key, color);
  }
  const colors = [...histogram.values()].map(color => ({rgb: color.sum.map(v => v / color.count), count: color.count}));
  if (!colors.length) return pixels;
  function box(values) {
    const ranges = [0, 1, 2].map(c => Math.max(...values.map(v => v.rgb[c])) - Math.min(...values.map(v => v.rgb[c])));
    const axis = ranges.indexOf(Math.max(...ranges));
    const count = values.reduce((sum, color) => sum + color.count, 0);
    return {values, axis, count, score: values.length > 1 ? ranges[axis] * Math.sqrt(count) : 0};
  }
  const boxes = [box(colors)];
  while (boxes.length < limit) {
    boxes.sort((a, b) => b.score - a.score);
    if (!boxes[0].score) break;
    const current = boxes.shift();
    current.values.sort((a, b) => a.rgb[current.axis] - b.rgb[current.axis]);
    let count = 0, split = 0;
    while (split < current.values.length - 1 && count < current.count / 2) count += current.values[split++].count;
    boxes.push(box(current.values.slice(0, split)), box(current.values.slice(split)));
  }
  const palette = boxes.map(b => [0, 1, 2].map(c => Math.round(b.values.reduce((sum, v) => sum + v.rgb[c] * v.count, 0) / b.count)));
  const nearest = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const key = pixels[i] << 16 | pixels[i + 1] << 8 | pixels[i + 2];
    let color = nearest.get(key);
    if (!color) {
      let distance = Infinity;
      for (const candidate of palette) {
        const d = .3 * (pixels[i] - candidate[0]) ** 2 + .59 * (pixels[i + 1] - candidate[1]) ** 2 + .11 * (pixels[i + 2] - candidate[2]) ** 2;
        if (d < distance) { distance = d; color = candidate; }
      }
      nearest.set(key, color);
    }
    pixels.set(color, i);
  }
  return pixels;
}
