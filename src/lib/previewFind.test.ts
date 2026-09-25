import { describe, expect, it } from 'vitest';
import { findInPreview } from '@/lib/previewFind';

function rootWith(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('findInPreview', () => {
  it('finds case-insensitive matches with the right ranges', () => {
    const root = rootWith('Hello hello HELLO');
    const matches = findInPreview(root, 'hello', false);
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => [m.range.startOffset, m.range.endOffset])).toEqual([
      [0, 5],
      [6, 11],
      [12, 17],
    ]);
  });

  it('only matches exact case when caseSensitive is true', () => {
    const root = rootWith('Hello hello HELLO');
    const matches = findInPreview(root, 'hello', true);
    expect(matches).toHaveLength(1);
    expect([matches[0].range.startOffset, matches[0].range.endOffset]).toEqual([6, 11]);
  });

  it('does not throw on a query with case-changing characters', () => {
    const root = rootWith('İstanbul is a city');
    expect(() => findInPreview(root, 'i̇stanbul', false)).not.toThrow();
    expect(() => findInPreview(root, 'istanbul', false)).not.toThrow();
  });

  it('escapes regex special characters in the query', () => {
    const root = rootWith('cost: $5 (five dollars)');
    const matches = findInPreview(root, '$5 (five', false);
    expect(matches).toHaveLength(1);
  });

  it('returns no matches for an empty query', () => {
    const root = rootWith('anything');
    expect(findInPreview(root, '', false)).toEqual([]);
  });
});
