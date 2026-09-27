import { describe, expect, it } from 'vitest';
import { stepWheel, type WheelAccumulator } from '@/lib/wheelAccumulator';

describe('stepWheel', () => {
  it('steps once per normal mouse wheel event (deltaY ≥ 100)', () => {
    const acc: WheelAccumulator = { delta: 0, lastDirection: null };
    expect(stepWheel(acc, -100)).toBe(1); // Up (negative deltaY)
    expect(acc.delta).toBe(0);
  });

  it('handles large deltaY as a single step', () => {
    const acc: WheelAccumulator = { delta: 0, lastDirection: null };
    expect(stepWheel(acc, -200)).toBe(1); // Just one step, not two
  });

  it('accumulates small touchpad deltas and steps once per 100 units', () => {
    const acc: WheelAccumulator = { delta: 0, lastDirection: null };
    expect(stepWheel(acc, -20)).toBe(0);
    expect(stepWheel(acc, -30)).toBe(0);
    expect(stepWheel(acc, -50)).toBe(1); // Total -100, step once
    expect(acc.delta).toBe(0);
  });

  it('treats large deltas (≥100) as single mouse wheel notches', () => {
    const acc: WheelAccumulator = { delta: 0, lastDirection: null };
    expect(stepWheel(acc, -250)).toBe(1); // Single notch, not accumulated
    expect(acc.delta).toBe(0);
  });

  it('resets accumulator on direction change', () => {
    const acc: WheelAccumulator = { delta: 0, lastDirection: null };
    expect(stepWheel(acc, -50)).toBe(0); // Up direction
    expect(acc.delta).toBe(-50);
    expect(stepWheel(acc, 30)).toBe(0); // Down direction, resets
    expect(acc.delta).toBe(30); // New accumulation starts
  });

  it('zooms in (negative deltaY) and out (positive deltaY)', () => {
    const acc: WheelAccumulator = { delta: 0, lastDirection: null };
    expect(stepWheel(acc, -100)).toBe(1); // Zoom in
    expect(stepWheel(acc, 100)).toBe(-1); // Zoom out
  });

  it('maintains direction state across multiple calls', () => {
    const acc: WheelAccumulator = { delta: 0, lastDirection: null };
    stepWheel(acc, -20);
    expect(acc.lastDirection).toBe(-1);
    stepWheel(acc, -30);
    expect(acc.lastDirection).toBe(-1);
  });
});
