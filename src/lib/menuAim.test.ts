import { describe, it, expect } from 'vitest';
import { isHeadingForSubmenu, isInsideSafeTriangle, nearEdgeCorners } from './menuAim';

const apex = { x: 0, y: 50 };
const top = { x: 100, y: 0 };
const bottom = { x: 100, y: 100 };

describe('isInsideSafeTriangle', () => {
  it('accepts a point inside the triangle', () => {
    expect(isInsideSafeTriangle({ x: 50, y: 50 }, apex, top, bottom)).toBe(true);
    expect(isInsideSafeTriangle({ x: 90, y: 20 }, apex, top, bottom)).toBe(true);
  });

  it('rejects points outside each edge', () => {
    expect(isInsideSafeTriangle({ x: 50, y: 10 }, apex, top, bottom)).toBe(false); // above
    expect(isInsideSafeTriangle({ x: 50, y: 90 }, apex, top, bottom)).toBe(false); // below
    expect(isInsideSafeTriangle({ x: -10, y: 50 }, apex, top, bottom)).toBe(false); // behind
    expect(isInsideSafeTriangle({ x: 120, y: 50 }, apex, top, bottom)).toBe(false); // past it
  });

  it('counts points on the edges and corners as inside', () => {
    expect(isInsideSafeTriangle({ x: 50, y: 25 }, apex, top, bottom)).toBe(true);
    expect(isInsideSafeTriangle({ x: 100, y: 50 }, apex, top, bottom)).toBe(true);
    expect(isInsideSafeTriangle(top, apex, top, bottom)).toBe(true);
    expect(isInsideSafeTriangle(apex, apex, top, bottom)).toBe(true);
  });

  it('allows a little tolerance outside the edges', () => {
    const justAbove = { x: 50, y: 23 }; // about 2.2 px outside the top edge
    expect(isInsideSafeTriangle(justAbove, apex, top, bottom, 0)).toBe(false);
    expect(isInsideSafeTriangle(justAbove, apex, top, bottom, 3)).toBe(true);
  });

  it('works for a submenu on the left (mirrored triangle)', () => {
    const leftApex = { x: 200, y: 50 };
    const leftTop = { x: 100, y: 0 };
    const leftBottom = { x: 100, y: 100 };
    expect(isInsideSafeTriangle({ x: 150, y: 50 }, leftApex, leftTop, leftBottom)).toBe(true);
    expect(isInsideSafeTriangle({ x: 150, y: 5 }, leftApex, leftTop, leftBottom)).toBe(false);
    expect(isInsideSafeTriangle({ x: 250, y: 50 }, leftApex, leftTop, leftBottom)).toBe(false);
  });

  it('does not depend on the corners being listed top-first', () => {
    expect(isInsideSafeTriangle({ x: 50, y: 50 }, apex, bottom, top)).toBe(true);
    expect(isInsideSafeTriangle({ x: 50, y: 90 }, apex, bottom, top)).toBe(false);
  });

  it('contains nothing when the triangle is degenerate', () => {
    // Collinear corners.
    expect(
      isInsideSafeTriangle({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }),
    ).toBe(false);
    // The apex on the submenu's edge, so the triangle is flat.
    expect(isInsideSafeTriangle({ x: 100, y: 50 }, { x: 100, y: 50 }, top, bottom, 2)).toBe(false);
    // Coincident corners.
    expect(isInsideSafeTriangle(apex, apex, apex, apex, 5)).toBe(false);
  });
});

describe('nearEdgeCorners', () => {
  const box = { left: 200, right: 400, top: 100, bottom: 300 };

  it('uses the left edge when the pointer is left of the submenu', () => {
    expect(nearEdgeCorners({ x: 150, y: 114 }, box)).toEqual({
      top: { x: 200, y: 100 },
      bottom: { x: 200, y: 300 },
    });
  });

  it('uses the right edge when the submenu flipped to the left of the pointer', () => {
    expect(nearEdgeCorners({ x: 450, y: 114 }, box)).toEqual({
      top: { x: 400, y: 100 },
      bottom: { x: 400, y: 300 },
    });
  });
});

describe('isHeadingForSubmenu', () => {
  const box = { left: 200, right: 400, top: 100, bottom: 300 };

  it('accepts a diagonal step towards a submenu on the right', () => {
    expect(isHeadingForSubmenu({ x: 175, y: 132 }, { x: 150, y: 114 }, box)).toBe(true);
  });

  it('rejects a straight step down', () => {
    expect(isHeadingForSubmenu({ x: 150, y: 140 }, { x: 150, y: 114 }, box)).toBe(false);
  });

  it('rejects a step away from the submenu', () => {
    expect(isHeadingForSubmenu({ x: 120, y: 114 }, { x: 150, y: 114 }, box)).toBe(false);
  });

  it('accepts a diagonal step towards a submenu on the left', () => {
    expect(isHeadingForSubmenu({ x: 475, y: 132 }, { x: 500, y: 114 }, box)).toBe(true);
    expect(isHeadingForSubmenu({ x: 500, y: 140 }, { x: 500, y: 114 }, box)).toBe(false);
  });
});
