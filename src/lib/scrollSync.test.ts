import { describe, expect, it } from 'vitest';
import { lineForOffset, offsetForLine, innermostBlockIndex, type Block } from './scrollSync';

// Three blocks: lines 0-2 at 0..100px, gap, lines 4-10 at 120..320px, lines 12-13 at 340..380px
const blocks: Block[] = [
  { start: 0, end: 2, top: 0, height: 100 },
  { start: 4, end: 10, top: 120, height: 200 },
  { start: 12, end: 13, top: 340, height: 40 },
];

describe('lineForOffset', () => {
  it('maps offsets inside a block proportionally', () => {
    expect(lineForOffset(blocks, 0)).toBe(0);
    expect(lineForOffset(blocks, 50)).toBe(1);
    expect(lineForOffset(blocks, 120)).toBe(4);
    expect(lineForOffset(blocks, 220)).toBe(7);
  });
  it('interpolates across gaps between blocks', () => {
    expect(lineForOffset(blocks, 110)).toBe(3); // halfway through the 100..120 gap → line 2..4
  });
  it('clamps beyond the last block', () => {
    expect(lineForOffset(blocks, 1000)).toBe(13);
    expect(lineForOffset([], 50)).toBe(0);
  });
});

describe('offsetForLine', () => {
  it('is the inverse of lineForOffset inside blocks', () => {
    for (const off of [0, 50, 120, 220, 350]) {
      expect(offsetForLine(blocks, lineForOffset(blocks, off))).toBeCloseTo(off, 6);
    }
  });
  it('interpolates gaps and clamps', () => {
    expect(offsetForLine(blocks, 3)).toBe(110);
    expect(offsetForLine(blocks, 99)).toBe(380);
    expect(offsetForLine([], 3)).toBe(0);
  });
});

describe('innermostBlockIndex', () => {
  it('finds a top-level paragraph', () => {
    const ranges = [{ start: 0, end: 2 }];
    expect(innermostBlockIndex(ranges, 0)).toBe(0);
    expect(innermostBlockIndex(ranges, 1)).toBe(0);
  });
  it('returns the innermost block when nested', () => {
    // A list (0-10) with a list item (2-4) nested inside
    const ranges = [
      { start: 0, end: 10 },
      { start: 2, end: 4 },
    ];
    expect(innermostBlockIndex(ranges, 2)).toBe(1); // list item, not list
    expect(innermostBlockIndex(ranges, 3)).toBe(1);
    expect(innermostBlockIndex(ranges, 1)).toBe(0); // only list contains it
  });
  it('prefers the later block when span is tied', () => {
    const ranges = [
      { start: 0, end: 4 },
      { start: 1, end: 3 },
      { start: 2, end: 4 }, // same span as block 0, but later
    ];
    expect(innermostBlockIndex(ranges, 2)).toBe(2);
    expect(innermostBlockIndex(ranges, 1)).toBe(1); // smaller span
  });
  it('returns -1 when no block contains the line', () => {
    const ranges = [
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ];
    expect(innermostBlockIndex(ranges, 2)).toBe(-1); // between blocks
    expect(innermostBlockIndex(ranges, 3)).toBe(-1);
    expect(innermostBlockIndex(ranges, 6)).toBe(-1); // after last
  });
  it('returns -1 for an empty list', () => {
    expect(innermostBlockIndex([], 5)).toBe(-1);
  });
});
