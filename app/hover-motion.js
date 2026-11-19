export const HOVER_FALLOFF = 2.8;
export const HOVER_TILT = .32;
export const followPointer = delta => 1 - Math.exp(-delta / 85);

export function hoverPose(dx, dy, size, strength) {
  const x = dx / size, y = dy / size;
  const influence = Math.exp(-(x * x + y * y) * HOVER_FALLOFF) * strength;
  const clamp = value => Math.max(-.65, Math.min(.65, value));
  return {x: -clamp(y) * influence * HOVER_TILT, y: clamp(x) * influence * HOVER_TILT, influence};
}
