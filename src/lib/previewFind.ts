/**
 * Text search in the rendered preview using the CSS Custom Highlight API, which
 * highlights ranges without mutating the DOM (so scroll sync, outline and the
 * rendered HTML are unaffected).
 */

const ALL = 'md-find';
const CURRENT = 'md-find-current';

export interface TextSegment {
  text: string;
  block: number;
}

/**
 * Joins text segments into one searchable string. A "\n" is inserted between segments from
 * different blocks, so a match never runs from one paragraph into the next. `starts[i]` is where
 * segment i begins in `text`.
 */
export function joinSegments(segments: readonly TextSegment[]): { text: string; starts: number[] } {
  const starts: number[] = [];
  let text = '';
  let lastBlock = -1;

  for (const seg of segments) {
    if (seg.block !== lastBlock && text.length > 0) {
      text += '\n';
    }
    starts.push(text.length);
    text += seg.text;
    lastBlock = seg.block;
  }

  return { text, starts };
}

/**
 * Maps an offset in the joined text back to (segment index, offset in that segment). An offset
 * that falls on an inserted "\n" maps to the end of the previous segment.
 */
export function locateOffset(
  starts: readonly number[],
  segments: readonly TextSegment[],
  offset: number,
): { index: number; offset: number } {
  // Find which segment this offset belongs to
  let index = 0;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (starts[i] <= offset) {
      index = i;
      break;
    }
  }

  const segmentStart = starts[index];
  const offsetInSegment = offset - segmentStart;

  // If the offset is within the text of this segment, return it
  if (offsetInSegment <= segments[index].text.length) {
    return { index, offset: offsetInSegment };
  }

  // Otherwise, the offset falls on an inserted newline; map to end of segment
  return { index, offset: segments[index].text.length };
}

export interface PreviewMatch {
  range: Range;
}

/** The match index to show after a re-search: kept (clamped) when only the document changed,
 * reset to 0 when the search itself changed. */
export function matchIndexAfterSearch(
  prevIndex: number,
  searchChanged: boolean,
  count: number,
): number {
  if (searchChanged || count === 0) return 0;
  return Math.min(prevIndex, count - 1);
}

/** Escapes a string for literal use inside a RegExp pattern. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findInPreview(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean,
): PreviewMatch[] {
  clearPreviewHighlights();
  const matches: PreviewMatch[] = [];
  if (!query) return matches;

  // Collect text nodes and their block ancestors
  const nodes: Node[] = [];
  const segments: TextSegment[] = [];
  const blockMap = new Map<HTMLElement, number>();
  let blockCounter = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // Skip hidden KaTeX MathML duplicate and mermaid source.
      if (parent.closest('.katex-mathml, .mermaid-source')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '';
    // Find the closest block ancestor
    let blockEl = node.parentElement;
    while (blockEl && blockEl !== root) {
      const blockSelector =
        'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, dt, dd, figcaption, summary';
      if ((blockEl as Element).matches(blockSelector)) {
        break;
      }
      blockEl = blockEl.parentElement;
    }
    if (!blockEl) blockEl = root;

    const blockNum = blockMap.has(blockEl) ? blockMap.get(blockEl)! : blockCounter++;
    blockMap.set(blockEl, blockNum);

    nodes.push(node);
    segments.push({ text, block: blockNum });
  }

  // Join segments and search
  const { text: joined, starts } = joinSegments(segments);

  const re = new RegExp(escapeRegExp(query), caseSensitive ? 'gu' : 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }

    // Map match offsets back to nodes
    const startLoc = locateOffset(starts, segments, m.index);
    const endLoc = locateOffset(starts, segments, m.index + m[0].length);

    const range = document.createRange();
    range.setStart(nodes[startLoc.index], startLoc.offset);
    range.setEnd(nodes[endLoc.index], endLoc.offset);

    matches.push({ range });
  }

  if (supportsHighlights()) {
    CSS.highlights.set(ALL, new Highlight(...matches.map((m) => m.range)));
  }
  return matches;
}

export function setCurrentPreviewMatch(
  matches: PreviewMatch[],
  index: number,
  opts: { scroll?: boolean } = {},
): void {
  if (!supportsHighlights()) return;
  const m = matches[index];
  if (!m) {
    CSS.highlights.delete(CURRENT);
    return;
  }
  CSS.highlights.set(CURRENT, new Highlight(m.range));
  if (opts.scroll !== false) {
    const el = m.range.startContainer.parentElement;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

export function clearPreviewHighlights(): void {
  if (!supportsHighlights()) return;
  CSS.highlights.delete(ALL);
  CSS.highlights.delete(CURRENT);
}

function supportsHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}
