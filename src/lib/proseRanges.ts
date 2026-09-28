import type { syntaxTree } from '@codemirror/language';

/** The lezer tree type, taken from `syntaxTree`'s return type so nothing here has to import
 * `@lezer/common` directly (it's only a transitive dependency, via `@codemirror/language`). */
type Tree = ReturnType<typeof syntaxTree>;

export interface Range {
  from: number;
  to: number;
}

/** Syntax node types that are never prose: code, raw URLs, HTML and reference definitions.
 * Checked against the real GFM parser's node names (see `proseRanges.test.ts`) rather than
 * trusted blindly. */
const EXCLUDED_NODE_NAMES = new Set([
  'FencedCode', // ```code```
  'CodeBlock', // indented code
  'InlineCode', // `code`
  'URL', // link/image/autolink/reference-definition destinations, and bare GFM autolinks
  'Autolink', // <https://…> (its own URL child is already excluded; excluded too for clarity)
  'LinkReference', // [x]: https://… "title" — the whole definition line
  'HTMLTag', // inline <tag>
  'HTMLBlock', // block-level HTML
  'Comment', // inline <!-- … -->
  'CommentBlock', // block-level <!-- … -->
]);

/** Matches a line that is exactly `---` (a front matter delimiter), CRLF-tolerant. */
const FRONT_MATTER_DELIMITER = /^---\r?\n[\s\S]*?\r?\n---\r?(?:\n|$)/;

/** A YAML front matter block at the very start of the document, if there is one. */
function frontMatterRange(doc: string): Range | null {
  const match = FRONT_MATTER_DELIMITER.exec(doc);
  if (!match || match.index !== 0) return null;
  return { from: 0, to: match[0].length };
}

/** `$$…$$` block maths (the same "dollars" delimiters `@mdit/plugin-katex` is configured with),
 * spanning any number of lines, matched non-greedily so consecutive blocks don't merge. */
const BLOCK_MATH = /\$\$[\s\S]*?\$\$/g;

/** `$…$` inline maths: no blank line inside, and (matching `allowInlineWithSpace: false`) no
 * whitespace touching either `$`. */
const INLINE_MATH = /\$(?!\s)[^$\n]+?(?<!\s)\$/g;

function mathRanges(doc: string): Range[] {
  const ranges: Range[] = [];
  for (const m of doc.matchAll(BLOCK_MATH)) {
    ranges.push({ from: m.index, to: m.index + m[0].length });
  }
  for (const m of doc.matchAll(INLINE_MATH)) {
    const from = m.index;
    const to = from + m[0].length;
    if (ranges.some((r) => from < r.to && to > r.from)) continue; // inside a $$ block
    ranges.push({ from, to });
  }
  return ranges;
}

/** A 6-digit HEX colour code such as `#AA00BB` (not part of a longer hex run). */
const HEX_COLOR = /#[0-9a-fA-F]{6}\b/g;

function hexColorRanges(doc: string): Range[] {
  return [...doc.matchAll(HEX_COLOR)].map((m) => ({ from: m.index, to: m.index + m[0].length }));
}

/** Exclusions the parser doesn't represent as their own node: front matter, maths, HEX colours. */
function regexExclusions(doc: string): Range[] {
  const fm = frontMatterRange(doc);
  return [...(fm ? [fm] : []), ...mathRanges(doc), ...hexColorRanges(doc)];
}

/** The complement of `excluded` within `[from, to)`, merging overlaps. */
function subtract(from: number, to: number, excluded: Range[]): Range[] {
  if (from >= to) return [];
  if (excluded.length === 0) return [{ from, to }];
  const sorted = [...excluded].sort((a, b) => a.from - b.from);
  const result: Range[] = [];
  let cursor = from;
  for (const r of sorted) {
    if (r.from > cursor) result.push({ from: cursor, to: Math.min(r.from, to) });
    cursor = Math.max(cursor, r.to);
    if (cursor >= to) break;
  }
  if (cursor < to) result.push({ from: cursor, to });
  return result.filter((r) => r.from < r.to);
}

/**
 * The parts of `doc` in `[from, to)` that should be spell-checked: prose, minus code, raw URLs,
 * HTML, reference definitions (from the syntax tree) and maths/front matter/HEX colours (which
 * the parser doesn't distinguish, so they're matched by regex instead). Link text, image alt
 * text, headings, table cells, list items and quotes are prose and are kept.
 */
export function proseRanges(tree: Tree, doc: string, from: number, to: number): Range[] {
  const excluded: Range[] = [];
  tree.iterate({
    from,
    to,
    enter: (node) => {
      if (EXCLUDED_NODE_NAMES.has(node.name)) {
        excluded.push({ from: Math.max(node.from, from), to: Math.min(node.to, to) });
        return false; // nothing checkable inside, so don't bother descending
      }
      return true;
    },
  });
  for (const r of regexExclusions(doc)) {
    const f = Math.max(r.from, from);
    const t = Math.min(r.to, to);
    if (f < t) excluded.push({ from: f, to: t });
  }
  return subtract(from, to, excluded);
}

/**
 * Splits `ranges` at every line boundary they cross, so callers can cache spell-check results
 * per line: re-checking a window that happens to start or end mid-paragraph (e.g. after a small
 * scroll) still reuses every unchanged line instead of only unchanged whole segments.
 */
export function splitRangesByLine(doc: string, ranges: Range[]): Range[] {
  const segments: Range[] = [];
  for (const r of ranges) {
    let pos = r.from;
    while (pos < r.to) {
      let lineEnd = doc.indexOf('\n', pos);
      if (lineEnd === -1 || lineEnd > r.to) lineEnd = r.to;
      if (lineEnd > pos) segments.push({ from: pos, to: lineEnd });
      pos = lineEnd < r.to ? lineEnd + 1 : lineEnd;
    }
  }
  return segments;
}
