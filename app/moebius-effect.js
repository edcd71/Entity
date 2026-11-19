const clamp = n => Math.max(0, Math.min(1, n));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, n) => {const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t);};
const luminance = (r, g, b) => r * .299 + g * .587 + b * .114;
const palettes = {
  desert: {
    hues: [[231, 151, 133], [229, 184, 119], [186, 201, 145], [131, 196, 194], [153, 180, 215], [198, 164, 201]],
    paper: [255, 246, 221], neutral: [206, 195, 168], shadow: [86, 99, 133], ink: [44, 45, 61],
  },
  cosmic: {
    hues: [[236, 164, 186], [244, 202, 157], [169, 217, 189], [141, 209, 223], [176, 176, 225], [216, 172, 222]],
    paper: [246, 244, 235], neutral: [194, 196, 218], shadow: [91, 80, 135], ink: [47, 38, 69],
  },
};

// Small bilateral passes flatten photo texture while retaining drawn boundaries.
function flatten(input, width, height, step) {
  const result = new Float32Array(input.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    let r = 0, g = 0, b = 0, weight = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = (Math.max(0, Math.min(height - 1, y + dy * step)) * width + Math.max(0, Math.min(width - 1, x + dx * step))) * 3;
      const delta = (input[j] - input[i]) ** 2 + (input[j + 1] - input[i + 1]) ** 2 + (input[j + 2] - input[i + 2]) ** 2;
      const w = 1 / ((1 + dx * dx + dy * dy) * (1 + delta * 160));
      r += input[j] * w; g += input[j + 1] * w; b += input[j + 2] * w; weight += w;
    }
    result[i] = r / weight; result[i + 1] = g / weight; result[i + 2] = b / weight;
  }
  return result;
}

// A local ink-and-flat-color interpretation of the source photograph's shapes.
export function applyMoebiusEffect(input, width, height, {amount = 85, lines = 65, palette = 'desert'} = {}) {
  const strength = clamp(amount / 100);
  if (!strength) return input;
  const colors = palettes[palette === 'cosmic' ? 'cosmic' : 'desert'];
  const count = width * height, rgb = new Float32Array(count * 3);
  for (let p = 0; p < count; p++) for (let c = 0; c < 3; c++) rgb[p * 3 + c] = input[p * 4 + c] / 255;
  const step = Math.max(1, Math.round(Math.min(width, height) / 180));
  const flat = flatten(flatten(rgb, width, height, step), width, height, step);
  const light = new Float32Array(count);
  for (let p = 0; p < count; p++) light[p] = luminance(flat[p * 3], flat[p * 3 + 1], flat[p * 3 + 2]);
  const sample = (x, y) => light[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  const output = new Uint8ClampedArray(input.length), lineStrength = clamp(lines / 100);
  const blend = 1 - (1 - strength) ** 1.6;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, j = p * 3, i = p * 4;
    const r = flat[j], g = flat[j + 1], b = flat[j + 2], luma = light[p];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
    let hue = !chroma ? 0 : max === r ? (g - b) / chroma : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
    hue = (hue + 6) % 6;
    const family = Math.floor(hue), next = (family + 1) % 6;
    const hueMix = smooth(.25, .75, hue % 1), saturation = smooth(.025, .22, chroma);
    // Four broad, luminous washes rather than photographic continuous shading.
    const value = clamp((luma - .025) / .94) * 4;
    const band = (Math.floor(value) + smooth(.40, .60, value % 1)) / 4;
    const top = sample(x, y - 1), bottom = sample(x, y + 1), left = sample(x - 1, y), right = sample(x + 1, y);
    const gradient = Math.hypot(right - left, bottom - top);
    const valley = (top + bottom + left + right) * .25 - luma;
    // Trace only the dark side of a boundary for a finer, single pen line.
    const contour = smooth(.035, .22, gradient) * smooth(.002, .035, valley);
    const ink = contour * lineStrength * .95;
    const hatch = (x + 2 * y) % 11 === 0 ? smooth(.06, .17, luma) * (1 - smooth(.28, .44, luma)) * (1 - contour) * lineStrength * .12 : 0;
    const grain = (((x * 73856093 ^ y * 19349663) >>> 0) % 97 / 96 - .5) * .004;
    for (let c = 0; c < 3; c++) {
      const pigment = mix(colors.neutral[c], mix(colors.hues[family][c], colors.hues[next][c], hueMix), saturation) / 255;
      let color = band < .5 ? mix(colors.shadow[c] / 255, pigment, .16 + band * 1.68) : mix(pigment, colors.paper[c] / 255, (band - .5) * 1.8);
      color = mix(color, colors.ink[c] / 255, clamp(ink + hatch));
      output[i + c] = mix(input[i + c] / 255, clamp(color + grain), blend) * 255;
    }
    output[i + 3] = input[i + 3];
  }
  return output;
}
