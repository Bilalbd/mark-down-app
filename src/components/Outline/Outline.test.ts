import { describe, expect, it } from 'vitest';
import {
  activeHeadingFor,
  buildTree,
  collapsibleIds,
  visibleParents,
  expandOneLevel,
  collapseOneLevel,
  levelActions,
} from './Outline';
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

describe('visibleParents', () => {
  it('returns only parents whose ancestors are not collapsed', () => {
    const tree = buildTree([
      h(1, 'A', 0),
      h(2, 'B', 2),
      h(3, 'C', 4),
      h(2, 'D', 6),
      h(1, 'E', 8),
      h(2, 'F', 10),
    ]);
    const visible = visibleParents(tree, new Set());
    // A, B, E are parents (have children); D and F are leaves (no children)
    expect(visible.map((p) => p.id)).toEqual(['a', 'b', 'e']);

    // A collapsed: A is still visible (no ancestors), but B is hidden (A is collapsed)
    const visible2 = visibleParents(tree, new Set(['a']));
    expect(visible2.map((p) => p.id)).toEqual(['a', 'e']);
  });

  it('includes depth for each parent', () => {
    const tree = buildTree([h(1, 'A', 0), h(2, 'B', 2), h(3, 'C', 4)]);
    const visible = visibleParents(tree, new Set());
    expect(visible).toEqual([
      { id: 'a', depth: 0, collapsed: false },
      { id: 'b', depth: 1, collapsed: false },
    ]);
  });
});

describe('expandOneLevel', () => {
  it('expands only the shallowest level of visible collapsed parents', () => {
    const tree = buildTree([
      h(1, 'A', 0),
      h(2, 'B', 2),
      h(3, 'C', 4),
      h(2, 'D', 6),
      h(1, 'E', 8),
      h(2, 'F', 10),
    ]);
    // Start everything collapsed: parents are A, B, E
    const all = new Set(collapsibleIds(tree));
    expect(all).toEqual(new Set(['a', 'b', 'e']));

    // First click: expand only roots (A, E) which are at depth 0
    const step1 = expandOneLevel(tree, all);
    expect(step1.has('a')).toBe(false);
    expect(step1.has('e')).toBe(false);
    expect(step1.has('b')).toBe(true);

    // Second click: expand depth 1 (B)
    const step2 = expandOneLevel(tree, step1);
    expect(step2.has('b')).toBe(false);
    expect(step2.size).toBe(0);

    // Third click: nothing left to expand
    const step3 = expandOneLevel(tree, step2);
    expect(step3).toEqual(step2);
  });

  it('does not mutate the input set', () => {
    const tree = buildTree([h(1, 'A', 0), h(2, 'B', 2)]);
    const original = new Set(['a', 'b']);
    expandOneLevel(tree, original);
    expect(original).toEqual(new Set(['a', 'b']));
  });
});

describe('collapseOneLevel', () => {
  it('collapses only the deepest level of visible expanded parents', () => {
    const tree = buildTree([
      h(1, 'A', 0),
      h(2, 'B', 2),
      h(3, 'C', 4),
      h(2, 'D', 6),
      h(1, 'E', 8),
      h(2, 'F', 10),
    ]);
    // Start everything expanded: parents are A, B, E
    const all = new Set<string>();

    // First click: collapse depth 1 (B only, the deepest visible expanded parent)
    const step1 = collapseOneLevel(tree, all);
    expect(step1.has('b')).toBe(true);
    expect(step1.has('a')).toBe(false);
    expect(step1.has('e')).toBe(false);

    // Second click: now visible expanded parents are A, E at depth 0; collapse them
    const step2 = collapseOneLevel(tree, step1);
    expect(step2.has('a')).toBe(true);
    expect(step2.has('e')).toBe(true);
    expect(step2.has('b')).toBe(true);

    // Third click: no visible expanded parents left
    const step3 = collapseOneLevel(tree, step2);
    expect(step3).toEqual(step2);
  });

  it('does not mutate the input set', () => {
    const tree = buildTree([h(1, 'A', 0), h(2, 'B', 2)]);
    const original = new Set<string>();
    collapseOneLevel(tree, original);
    expect(original).toEqual(new Set());
  });
});

describe('levelActions', () => {
  it('canExpand true when at least one parent is collapsed', () => {
    const tree = buildTree([h(1, 'A', 0), h(2, 'B', 2), h(3, 'C', 4)]);
    expect(levelActions(tree, new Set()).canExpand).toBe(false);
    expect(levelActions(tree, new Set(['a'])).canExpand).toBe(true);
    expect(levelActions(tree, new Set(['b'])).canExpand).toBe(true);
  });

  it('canCollapse true when at least one visible parent is expanded', () => {
    const tree = buildTree([
      h(1, 'A', 0),
      h(2, 'B', 2),
      h(3, 'C', 4),
      h(2, 'D', 6),
      h(1, 'E', 8),
      h(2, 'F', 10),
    ]);
    expect(levelActions(tree, new Set()).canCollapse).toBe(true);
    expect(levelActions(tree, new Set(collapsibleIds(tree))).canCollapse).toBe(false);
    // A collapsed: B is hidden, so canCollapse is based on E only (which is expanded)
    expect(levelActions(tree, new Set(['a'])).canCollapse).toBe(true);
  });

  it('returns both false for a tree with no parents', () => {
    const tree = buildTree([h(1, 'A', 0), h(1, 'B', 2)]);
    expect(levelActions(tree, new Set())).toEqual({
      canExpand: false,
      canCollapse: false,
    });
  });

  it('mixed state: expanded A, collapsed B, collapsed E', () => {
    const tree = buildTree([
      h(1, 'A', 0),
      h(2, 'B', 2),
      h(3, 'C', 4),
      h(2, 'D', 6),
      h(1, 'E', 8),
      h(2, 'F', 10),
    ]);
    const collapsed = new Set(['b', 'e']);
    const actions = levelActions(tree, collapsed);
    expect(actions.canExpand).toBe(true);
    expect(actions.canCollapse).toBe(true);

    const expanded = expandOneLevel(tree, collapsed);
    // Should expand E (depth 0) before B (depth 1)
    expect(expanded.has('e')).toBe(false);
    expect(expanded.has('b')).toBe(true);
  });
});
