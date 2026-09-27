/** New size after a resize key, or null for keys that don't resize. Arrow keys move by `step`
 * (by `step * 5` with Shift); Home/End jump to `min`/`max`. The result is clamped. */
export function resizeByKey(
  key: string,
  shift: boolean,
  value: number,
  opts: { min: number; max: number; step: number },
): number | null {
  let delta = 0;
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      delta = -opts.step;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      delta = opts.step;
      break;
    case 'Home':
      return opts.min;
    case 'End':
      return opts.max;
    default:
      return null;
  }

  const multiplier = shift ? 5 : 1;
  const newValue = value + delta * multiplier;
  return Math.min(opts.max, Math.max(opts.min, newValue));
}
