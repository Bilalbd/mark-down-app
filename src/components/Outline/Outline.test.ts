import { describe, expect, it } from 'vitest';
import { activeHeadingFor, buildTree, collapsibleIds } from './Outline';
import type { HeadingInfo } from '@/markdown/plugins';

const h = (level: number, text: string, line: number): HeadingInfo => ({
  level,
  text,
  id: text.toLowerCase(),
  line,
});

describe('buildTree', () => {
  it('nests deeper headings under the nearest shallower one', () => {
    const tree = buildTree([h(1, 'A', 0), h(2, 'B', 2), h(3, 'C', 4), h(2, 'D', 6), h(1, 'E', 8)]);
    expect(tree.map((n) => n.text)).toEqual(['A', 'E']);
    expect(tree[0].children.map((n) => n.text)).toEqual(['B', 'D']);
    expect(tree[0].children[0].children.map((n) => n.text)).toEqual(['C']);
  });

  it('handles documents that skip levels or start deep', () => {
    const tree = buildTree([h(3, 'X', 0), h(1, 'Y', 2), h(4, 'Z', 4)]);
    expect(tree.map((n) => n.text)).toEqual(['X', 'Y']);
    expect(tree[1].children[0].text).toBe('Z');
  });
});

describe('activeHeadingFor', () => {
  const hs = [h(1, 'A', 0), h(2, 'B', 10), h(2, 'C', 20)];
  it('returns the last heading at or before the line', () => {
    expect(activeHeadingFor(hs, 0)?.text).toBe('A');
    expect(activeHeadingFor(hs, 9)?.text).toBe('A');
    expect(activeHeadingFor(hs, 10)?.text).toBe('B');
    expect(activeHeadingFor(hs, 999)?.text).toBe('C');
  });
  it('returns null before the first heading or with no headings', () => {
    expect(activeHeadingFor([h(1, 'A', 5)], 2)).toBeNull();
    expect(activeHeadingFor([], 0)).toBeNull();
  });
});

describe('collapsibleIds', () => {
  it('lists only nodes that have children, in document order', () => {
    const tree = buildTree([h(1, 'A', 0), h(2, 'B', 2), h(3, 'C', 4), h(1, 'D', 6)]);
    expect(collapsibleIds(tree)).toEqual(['a', 'b']);
  });
  it('returns an empty list for a flat outline', () => {
    const tree = buildTree([h(1, 'A', 0), h(1, 'B', 2)]);
    expect(collapsibleIds(tree)).toEqual([]);
  });
});
