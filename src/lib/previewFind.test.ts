import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  findInPreview,
  matchIndexAfterSearch,
  setCurrentPreviewMatch,
  joinSegments,
  locateOffset,
  type TextSegment,
} from '@/lib/previewFind';

function rootWith(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('joinSegments', () => {
  it('joins segments from the same block without newlines', () => {
    const segments: TextSegment[] = [
      { text: 'foo ', block: 0 },
      { text: 'bar', block: 0 },
    ];
    const { text, starts } = joinSegments(segments);
    expect(text).toBe('foo bar');
    expect(starts).toEqual([0, 4]);
  });

  it('inserts newlines between segments from different blocks', () => {
    const segments: TextSegment[] = [
      { text: 'foo', block: 0 },
      { text: 'bar', block: 1 },
    ];
    const { text, starts } = joinSegments(segments);
    expect(text).toBe('foo\nbar');
    expect(starts).toEqual([0, 4]);
  });

  it('never matches across block boundaries', () => {
    const segments: TextSegment[] = [
      { text: 'foo', block: 0 },
      { text: 'bar', block: 1 },
    ];
    const { text } = joinSegments(segments);
    expect(text).not.toContain('foobar');
  });
});

describe('locateOffset', () => {
  it('maps offsets within a segment correctly', () => {
    const segments: TextSegment[] = [
      { text: 'hello', block: 0 },
      { text: 'world', block: 0 },
    ];
    const { starts } = joinSegments(segments);
    const loc = locateOffset(starts, segments, 1);
    expect(loc).toEqual({ index: 0, offset: 1 });
  });

  it('maps offsets to the start of the second segment correctly', () => {
    const segments: TextSegment[] = [
      { text: 'hello', block: 0 },
      { text: 'world', block: 0 },
    ];
    const { starts } = joinSegments(segments);
    const loc = locateOffset(starts, segments, 5);
    expect(loc).toEqual({ index: 1, offset: 0 });
  });

  it('maps offsets at the end of a segment correctly', () => {
    const segments: TextSegment[] = [
      { text: 'hello', block: 0 },
      { text: 'world', block: 0 },
    ];
    const { starts } = joinSegments(segments);
    const loc = locateOffset(starts, segments, 10);
    expect(loc).toEqual({ index: 1, offset: 5 });
  });
});

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

  it('finds text spanning across formatting nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span>foo </span><strong>bar</strong>';
    document.body.appendChild(root);

    const matches = findInPreview(root, 'foo bar', false);
    expect(matches).toHaveLength(1);
    expect(matches[0].range.startContainer.textContent).toBe('foo ');
    expect(matches[0].range.endContainer.textContent).toBe('bar');

    document.body.removeChild(root);
  });

  it('does not match across paragraph boundaries', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>foo</p><p>bar</p>';
    document.body.appendChild(root);

    const matches = findInPreview(root, 'foobar', false);
    expect(matches).toHaveLength(0);

    document.body.removeChild(root);
  });

  it('does not match across separate paragraph blocks', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>foo</p><p>bar</p>';
    document.body.appendChild(root);

    const matches = findInPreview(root, 'foobar', false);
    expect(matches).toHaveLength(0);

    document.body.removeChild(root);
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
