import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { findInPreview, matchIndexAfterSearch, setCurrentPreviewMatch } from '@/lib/previewFind';

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

describe('matchIndexAfterSearch', () => {
  it('keeps the index when only the document changed', () => {
    const result = matchIndexAfterSearch(2, false, 5);
    expect(result).toBe(2);
  });

  it('clamps the index when matches shrink', () => {
    const result = matchIndexAfterSearch(4, false, 3);
    expect(result).toBe(2);
  });

  it('resets to 0 when the search changed', () => {
    const result = matchIndexAfterSearch(2, true, 5);
    expect(result).toBe(0);
  });

  it('returns 0 when there are no matches', () => {
    const result = matchIndexAfterSearch(2, false, 0);
    expect(result).toBe(0);
  });
});

describe('setCurrentPreviewMatch', () => {
  let originalCSS: typeof CSS | undefined;
  let originalHighlight: typeof Highlight | undefined;

  beforeEach(() => {
    originalCSS = globalThis.CSS;
    originalHighlight = globalThis.Highlight;
    Object.assign(globalThis, {
      CSS: { ...originalCSS, highlights: new Map() },
      Highlight: class Highlight {
        constructor(public range: Range) {}
      },
    });
  });

  afterEach(() => {
    if (originalCSS === undefined) {
      delete (globalThis as unknown as Record<string, unknown>).CSS;
    } else {
      (globalThis as unknown as Record<string, unknown>).CSS = originalCSS;
    }
    if (originalHighlight === undefined) {
      delete (globalThis as unknown as Record<string, unknown>).Highlight;
    } else {
      (globalThis as unknown as Record<string, unknown>).Highlight = originalHighlight;
    }
  });

  it('does not scroll when scroll is false', () => {
    const root = document.createElement('div');
    root.textContent = 'Hello hello';
    document.body.appendChild(root);

    const matches = findInPreview(root, 'hello', false);
    expect(matches.length).toBeGreaterThan(0);

    const el = matches[0].range.startContainer.parentElement;
    const scrollIntoViewSpy = vi.fn();
    if (el) {
      el.scrollIntoView = scrollIntoViewSpy;
    }
    setCurrentPreviewMatch(matches, 0, { scroll: false });
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    document.body.removeChild(root);
  });

  it('scrolls by default', () => {
    const root = document.createElement('div');
    root.textContent = 'Hello hello';
    document.body.appendChild(root);

    const matches = findInPreview(root, 'hello', false);
    expect(matches.length).toBeGreaterThan(0);

    const el = matches[0].range.startContainer.parentElement;
    const scrollIntoViewSpy = vi.fn();
    if (el) {
      el.scrollIntoView = scrollIntoViewSpy;
    }
    setCurrentPreviewMatch(matches, 0);
    expect(scrollIntoViewSpy).toHaveBeenCalled();

    document.body.removeChild(root);
  });
});
