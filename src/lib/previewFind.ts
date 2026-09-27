/**
 * Text search in the rendered preview using the CSS Custom Highlight API, which
 * highlights ranges without mutating the DOM (so scroll sync, outline and the
 * rendered HTML are unaffected).
 */

const ALL = 'md-find';
const CURRENT = 'md-find-current';

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

  // A case-insensitive regex, rather than lowercasing both sides, keeps offsets in
  // the *original* text correct even when a character's lowercase form has a
  // different length (e.g. 'İ'.toLowerCase() === 'i̇', two code points).
  const re = new RegExp(escapeRegExp(query), caseSensitive ? 'gu' : 'giu');
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
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      matches.push({ range });
    }
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
