import { describe, it, expect } from 'vitest';
import { resizeByKey } from './resize';

describe('resizeByKey', () => {
  const opts = { min: 0, max: 100, step: 10 };

  describe('arrow keys', () => {
    it('ArrowLeft decreases the value by step', () => {
      expect(resizeByKey('ArrowLeft', false, 50, opts)).toBe(40);
    });

    it('ArrowRight increases the value by step', () => {
      expect(resizeByKey('ArrowRight', false, 50, opts)).toBe(60);
    });

    it('ArrowUp decreases the value by step', () => {
      expect(resizeByKey('ArrowUp', false, 50, opts)).toBe(40);
    });

    it('ArrowDown increases the value by step', () => {
      expect(resizeByKey('ArrowDown', false, 50, opts)).toBe(60);
    });
  });

  describe('Shift multiplier', () => {
    it('Shift+ArrowRight increases by step * 5', () => {
      expect(resizeByKey('ArrowRight', true, 50, opts)).toBe(100);
    });

    it('Shift+ArrowLeft decreases by step * 5', () => {
      expect(resizeByKey('ArrowLeft', true, 50, opts)).toBe(0);
    });
  });

  describe('Home/End keys', () => {
    it('Home jumps to min', () => {
      expect(resizeByKey('Home', false, 50, opts)).toBe(0);
    });

    it('End jumps to max', () => {
      expect(resizeByKey('End', false, 50, opts)).toBe(100);
    });
  });

  describe('clamping', () => {
    it('clamps to min at the left', () => {
      expect(resizeByKey('ArrowLeft', false, 5, opts)).toBe(0);
    });

    it('clamps to max at the right', () => {
      expect(resizeByKey('ArrowRight', false, 95, opts)).toBe(100);
    });

    it('clamps large movements', () => {
      expect(resizeByKey('ArrowLeft', true, 25, opts)).toBe(0);
      expect(resizeByKey('ArrowRight', true, 75, opts)).toBe(100);
    });
  });

  describe('unrelated keys', () => {
    it('returns null for unrelated keys', () => {
      expect(resizeByKey('Enter', false, 50, opts)).toBeNull();
      expect(resizeByKey('a', false, 50, opts)).toBeNull();
      expect(resizeByKey('Escape', false, 50, opts)).toBeNull();
    });
  });
});
