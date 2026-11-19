const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const luminance = (r, g, b) => .299 * r + .587 * g + .114 * b;

// Two scales of edge-preserving paint abstraction remove photographic texture.
// Integral images keep the cost independent of brush radius.
function paintPlanes(input, width, height, radius) {
  const stride = width + 1;
  const sums = Array.from({length: 4}, () => new Float64Array(stride * (height + 1)));
  for (let y = 0; y < height; y++) {
    const row = [0, 0, 0, 0];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3, index = (y + 1) * stride + x + 1;
      const light = luminance(input[i], input[i + 1], input[i + 2]);
      for (let c = 0; c < 4; c++) {
        row[c] += c === 3 ? light * light : input[i + c];
        sums[c][index] = sums[c][index - stride] + row[c];
      }
    }
  }
  const area = (channel, x0, y0, x1, y1) => {
    const s = sums[channel];
    return s[(y1 + 1) * stride + x1 + 1] - s[y0 * stride + x1 + 1] - s[(y1 + 1) * stride + x0] + s[y0 * stride + x0];
  };
  const painted = new Float32Array(input.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let variance = Infinity, red = 0, green = 0, blue = 0;
      for (let q = 0; q < 4; q++) {
        const x0 = Math.max(0, x - (q & 1 ? 0 : radius)), x1 = Math.min(width - 1, x + (q & 1 ? radius : 0));
        const y0 = Math.max(0, y - (q & 2 ? 0 : radius)), y1 = Math.min(height - 1, y + (q & 2 ? radius : 0));
        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const r = area(0, x0, y0, x1, y1) / n, g = area(1, x0, y0, x1, y1) / n, b = area(2, x0, y0, x1, y1) / n;
        const mean = luminance(r, g, b);
        const v = area(3, x0, y0, x1, y1) / n - mean * mean;
        if (v < variance) {variance = v; red = r; green = g; blue = b;}
      }
      const i = (y * width + x) * 3;
      painted[i] = red; painted[i + 1] = green; painted[i + 2] = blue;
    }
  }
  return painted;
}

// Designed pigment ramps replace the photo's continuous tonal range.
const pigments = {
  daylight: {
    cool: [[17, 30, 60], [35, 68, 93], [59, 125, 144], [113, 190, 198], [185, 218, 206], [255, 240, 201]],
    warm: [[39, 30, 54], [103, 58, 73], [180, 91, 88], [233, 144, 105], [245, 199, 142], [255, 240, 203]],
    rim: [231, 255, 241], glow: [255, 209, 141], ink: [11, 24, 43],
  },
  neon: {
    cool: [[8, 14, 39], [18, 43, 79], [20, 101, 132], [35, 184, 196], [134, 235, 219], [232, 255, 226]],
    warm: [[27, 17, 49], [94, 36, 91], [186, 65, 119], [248, 116, 106], [255, 185, 114], [255, 240, 184]],
    rim: [98, 255, 245], glow: [255, 117, 171], ink: [7, 10, 31],
  },
};

// Local, deterministic concept illustration of the photograph's own geometry.
export function applyMeadEffect(input, width, height, {amount = 80, lines = 45, palette = 'daylight'} = {}) {
  const strength = clamp(amount / 100);
  if (!strength) return input;
  const count = width * height, stride = width + 1;
  const original = new Float32Array(count * 3);
  for (let p = 0; p < count; p++) for (let c = 0; c < 3; c++) original[p * 3 + c] = input[p * 4 + c] / 255;
  const radius = Math.max(2, Math.round(Math.min(width, height) / 38));
  const broad = paintPlanes(original, width, height, radius);
  const painted = paintPlanes(broad, width, height, Math.max(1, Math.round(radius * .55)));
  const light = new Float32Array(count);
  const emission = new Float32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const p = y * width + x, j = p * 3, index = (y + 1) * stride + x + 1;
      light[p] = luminance(painted[j], painted[j + 1], painted[j + 2]);
      row += smooth(.64, .97, light[p]) ** 2;
      emission[index] = emission[index - stride] + row;
    }
  }
  const bloomRadius = Math.max(3, Math.round(Math.min(width, height) / 19));
  function glowAt(x, y, rx, ry) {
    const x0 = Math.max(0, x - rx), x1 = Math.min(width - 1, x + rx);
    const y0 = Math.max(0, y - ry), y1 = Math.min(height - 1, y + ry);
    return Math.max(0, (emission[(y1 + 1) * stride + x1 + 1] - emission[y0 * stride + x1 + 1] - emission[(y1 + 1) * stride + x0] + emission[y0 * stride + x0]) / ((x1 - x0 + 1) * (y1 - y0 + 1)));
  }
  const neon = palette === 'neon', colors = pigments[neon ? 'neon' : 'daylight'];
  const output = new Uint8ClampedArray(input.length);
  const sample = (x, y) => light[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  const lineStrength = clamp(lines / 100);
  // Existing 80% settings now read as painted; zero is still exactly original.
  const blend = 1 - (1 - strength) ** 1.8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, i = p * 4, j = p * 3, luma = light[p];
      const gx = sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1) - sample(x - 1, y - 1) - 2 * sample(x - 1, y) - sample(x - 1, y + 1);
      const gy = sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1) - sample(x - 1, y - 1) - 2 * sample(x, y - 1) - sample(x + 1, y - 1);
      const gradient = Math.hypot(gx, gy);
      const edge = smooth(.08, .65, gradient);
      const facing = clamp((-gx * .55 - gy * .83) / Math.max(.001, gradient));
      const tone = smooth(neon ? .035 : .015, neon ? .96 : .98, luma) ** (neon ? .96 : .88);
      const step = tone * 5;
      // Narrow transitions separate large, deliberate value planes.
      const band = Math.min(5, Math.floor(step) + smooth(.38, .62, step % 1));
      const low = Math.floor(band), high = Math.min(5, low + 1), fraction = band - low;
      const warmth = smooth(.025, .25, painted[j] - painted[j + 2] + (painted[j] - painted[j + 1]) * .35);
      const ink = edge * lineStrength * (.25 + (1 - facing) * .65);
      const rim = edge * facing * (.12 + lineStrength * .65) * (neon ? .85 : .7);
      const bloom = glowAt(x, y, bloomRadius, bloomRadius) * (1 - smooth(.7, 1, luma)) * (neon ? .42 : .22);
      const streak = neon ? glowAt(x, y, bloomRadius * 3, 1) * (1 - smooth(.55, .95, luma)) * .11 : 0;
      const grain = (((x * 73856093 ^ y * 19349663) >>> 0) % 101 / 100 - .5) * .003;
      // Restrained marker hatching stays in shaded planes, away from contours.
      const hatch = ((x + y * 2) % 9 === 0) ? (1 - edge) * smooth(.1, .25, luma) * (1 - smooth(.35, .55, luma)) * .025 : 0;
      for (let c = 0; c < 3; c++) {
        const cool = mix(colors.cool[low][c], colors.cool[high][c], fraction) / 255;
        const warm = mix(colors.warm[low][c], colors.warm[high][c], fraction) / 255;
        let styled = mix(cool, warm, warmth);
        styled += (painted[j + c] - luma) * .15;
        styled = mix(styled, colors.ink[c] / 255, ink);
        styled = mix(styled, colors.rim[c] / 255, rim);
        styled += (1 - clamp(styled)) * (bloom * colors.glow[c] / 255 + streak * colors.rim[c] / 255);
        styled = clamp(styled + grain - hatch);
        output[i + c] = mix(input[i + c] / 255, styled, blend) * 255;
      }
      output[i + 3] = input[i + 3];
    }
  }
  return output;
}
