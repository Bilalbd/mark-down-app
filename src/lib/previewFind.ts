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

export function findInPreview(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean,
): PreviewMatch[] {
  clearPreviewHighlights();
  const matches: PreviewMatch[] = [];
  if (!query) return matches;

  const needle = caseSensitive ? query : query.toLowerCase();
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
    const hay = caseSensitive ? text : text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + query.length);
      matches.push({ range });
      i = hay.indexOf(needle, i + needle.length);
    }
  }

  if (supportsHighlights()) {
    CSS.highlights.set(ALL, new Highlight(...matches.map((m) => m.range)));
  }
  return matches;
}

export function setCurrentPreviewMatch(matches: PreviewMatch[], index: number): void {
  if (!supportsHighlights()) return;
  const m = matches[index];
  if (!m) {
    CSS.highlights.delete(CURRENT);
    return;
  }
  CSS.highlights.set(CURRENT, new Highlight(m.range));
  const el = m.range.startContainer.parentElement;
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function clearPreviewHighlights(): void {
  if (!supportsHighlights()) return;
  CSS.highlights.delete(ALL);
  CSS.highlights.delete(CURRENT);
}

function supportsHighlights(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}
