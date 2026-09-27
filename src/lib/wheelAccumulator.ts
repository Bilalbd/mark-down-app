/** Accumulates mouse wheel delta, distinguishing between normal mouse wheels and touchpads. */
export interface WheelAccumulator {
  delta: number;
  lastDirection: number | null;
}

/**
 * Steps through accumulated wheel delta (deltaY). A mouse wheel notch (|deltaY| ≥ 100) steps
 * once per event; small touchpad deltas accumulate and step once per 100 units. Direction
 * changes reset the accumulator.
 */
export function stepWheel(acc: WheelAccumulator, deltaY: number): number {
  const direction = Math.sign(deltaY);

  // Direction change resets the accumulator
  if (acc.lastDirection !== null && acc.lastDirection !== direction) {
    acc.delta = 0;
  }

  acc.lastDirection = direction;

  // Normal mouse wheel: a single notch (|deltaY| ≥ 100) steps once and is not accumulated
  if (Math.abs(deltaY) >= 100) {
    acc.delta = 0;
    return -direction;
  }

  // Touchpad: accumulate small deltas and step once per 100 units
  acc.delta += deltaY;
  const steps = Math.floor(Math.abs(acc.delta) / 100);
  if (steps > 0) {
    const remainder = acc.delta % 100;
    // Avoid -0 from modulo operation
    acc.delta = remainder === 0 ? 0 : remainder;
    return -direction * steps;
  }

  return 0;
}
