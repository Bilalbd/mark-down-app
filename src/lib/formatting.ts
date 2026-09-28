import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';

/** Characters that make up a word for "the word under the cursor". */
const WORD_CHAR = /[\p{L}\p{N}_']/u;

/** Leading blockquote markers (`> `, `>> `, `> > `), kept when a line gets a list marker. */
const QUOTE_PREFIX = /^(?:[ \t]*>[ \t]?)*/;
/** Everything before a heading can start: indentation, quote markers and a list or task marker. */
const BLOCK_PREFIX =
  /^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?/;
const ATX_MARKER = /^#{1,6}(?=[ \t]|$)[ \t]*/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const TASK_MARKER = /^([ \t]*)[-*+][ \t]+\[[ xX]\][ \t]+/;
const ORDERED_MARKER = /^([ \t]*)\d{1,9}[.)][ \t]+/;
const BULLET_MARKER = /^([ \t]*)[-*+][ \t]+/;
const FENCE_LINE = /^ {0,3}(?:`{3,}|~{3,})/;
const URL_LIKE = /^(?:https?:\/\/|mailto:)\S+$/i;

interface RangeResult {
  changes?: ChangeSpec[];
  range: SelectionRange;
}

/** Runs `build` for every selection range as one transaction; `null` when nothing changes. */
function forEachRange(
  state: EditorState,
  build: (range: SelectionRange) => RangeResult,
): TransactionSpec | null {
  const spec = state.changeByRange(build);
  if (spec.changes.empty) return null;
  return { ...spec, scrollIntoView: true, userEvent: 'input.format' };
}

/** Maps `range` through `changes` (given in the original document's positions). */
function mapRange(
  state: EditorState,
  changes: ChangeSpec[],
  range: SelectionRange,
  assocFrom: -1 | 1 = 1,
  assocTo: -1 | 1 = 1,
): SelectionRange {
  const set = state.changes(changes);
  if (range.empty) return EditorSelection.cursor(set.mapPos(range.head, assocFrom));
  return EditorSelection.range(set.mapPos(range.from, assocFrom), set.mapPos(range.to, assocTo));
}

/** The word touching `pos`, or `null` when there's no word character on either side. */
function wordAt(state: EditorState, pos: number): { from: number; to: number } | null {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  let start = pos - line.from;
  let end = start;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  // Apostrophes belong inside words ("Bilal's"), not around them ('quoted').
  while (start < end && text[start] === "'") start++;
  while (end > start && text[end - 1] === "'") end--;
  if (start === end) return null;
  return { from: line.from + start, to: line.from + end };
}

/** The line numbers a range touches. A selection ending at the very start of a line (the usual
 * result of selecting whole lines) doesn't include that line. */
function touchedLines(state: EditorState, range: SelectionRange): { first: number; last: number } {
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  if (!range.empty && last.number > first.number && range.to === last.from) {
    return { first: first.number, last: last.number - 1 };
  }
  return { first: first.number, last: last.number };
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

function runBefore(text: string, index: number, char: string): number {
  let n = 0;
  while (index - n > 0 && text[index - n - 1] === char) n++;
  return n;
}

function runAfter(text: string, index: number, char: string): number {
  let n = 0;
  while (index + n < text.length && text[index + n] === char) n++;
  return n;
}

function longestRun(text: string, char: string): number {
  let longest = 0;
  let current = 0;
  for (const c of text) {
    current = c === char ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

// ---- Headings ----------------------------------------------------------------------------

/** Sets every touched line to heading `level` (0 = paragraph). If every line already has that
 * level, they become paragraphs instead (toggle). Quote and list markers stay in front; blank
 * lines and setext headings are left alone. */
export function setHeading(
  state: EditorState,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): TransactionSpec | null {
  return forEachRange(state, (range) => {
    const { first, last } = touchedLines(state, range);
    const targets: { from: number; to: number; current: number }[] = [];
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      const text = line.text;
      if (isBlank(text) || SETEXT_UNDERLINE.test(text) || THEMATIC_BREAK.test(text)) continue;
      const next = n < state.doc.lines ? state.doc.line(n + 1).text : '';
      if (SETEXT_UNDERLINE.test(next)) continue;
      const prefix = BLOCK_PREFIX.exec(text)![0];
      const marker = ATX_MARKER.exec(text.slice(prefix.length));
      const from = line.from + prefix.length;
      targets.push({
        from,
        to: from + (marker ? marker[0].length : 0),
        current: marker ? marker[0].trimEnd().length : 0,
      });
    }
    const target = level !== 0 && targets.every((t) => t.current === level) ? 0 : level;
    const insert = target > 0 ? '#'.repeat(target) + ' ' : '';
    const changes: ChangeSpec[] = targets
      .filter((t) => t.current !== target)
      .map((t) => ({ from: t.from, to: t.to, insert }));
    return { changes, range: mapRange(state, changes, range) };
  });
}

// ---- Inline formats ----------------------------------------------------------------------

interface InlineStyle {
  char: string;
  size: number;
  /** Whether a run of `n` marker characters on both sides carries this style. */
  has: (n: number) => boolean;
}

const BOLD: InlineStyle = { char: '*', size: 2, has: (n) => n >= 2 };
const ITALIC: InlineStyle = { char: '*', size: 1, has: (n) => n % 2 === 1 };
const STRIKETHROUGH: InlineStyle = { char: '~', size: 2, has: (n) => n >= 2 };

/** `[from, to)` without whitespace at either end, plus its line; `null` if nothing is left. */
function trimSpan(state: EditorState, from: number, to: number) {
  const raw = state.doc.sliceString(from, to);
  const a = from + (raw.length - raw.trimStart().length);
  const b = to - (raw.length - raw.trimEnd().length);
  if (a >= b) return null;
  const line = state.doc.lineAt(a);
  return { a, b, text: line.text, ia: a - line.from, ib: b - line.from };
}

/** Adds the changes that toggle `style` on `[from, to)`, a span within one line. Whitespace at
 * either end stays outside the markers. */
function toggleSpan(
  state: EditorState,
  from: number,
  to: number,
  style: InlineStyle,
  changes: ChangeSpec[],
): void {
  const span = trimSpan(state, from, to);
  if (!span) return;
  const { a, b, text, ia, ib } = span;
  const { char, size } = style;

  // Markers inside the span: `[**word**]`.
  const inStart = runAfter(text, ia, char);
  const inEnd = runBefore(text, ib, char);
  if (inStart + inEnd < ib - ia && style.has(Math.min(inStart, inEnd))) {
    changes.push({ from: a, to: a + size }, { from: b - size, to: b });
    return;
  }
  // Markers just outside it: `**[word]**`.
  if (inStart === 0 && inEnd === 0) {
    const outside = Math.min(runBefore(text, ia, char), runAfter(text, ib, char));
    if (style.has(outside)) {
      changes.push({ from: a - size, to: a }, { from: b, to: b + size });
      return;
    }
  }
  const marker = char.repeat(size);
  changes.push({ from: a, insert: marker }, { from: b, insert: marker });
}

/** Adds the changes that toggle inline code on `[from, to)`, a span within one line. */
function toggleCodeSpan(state: EditorState, from: number, to: number, changes: ChangeSpec[]): void {
  const span = trimSpan(state, from, to);
  if (!span) return;
  const { a, b, text, ia, ib } = span;
  const body = text.slice(ia, ib);

  const inStart = runAfter(text, ia, '`');
  const inEnd = runBefore(text, ib, '`');
  if (inStart > 0 && inStart === inEnd && inStart * 2 < body.length) {
    const inner = body.slice(inStart, body.length - inEnd);
    const pad = inner.length > 2 && inner.startsWith(' ') && inner.endsWith(' ') ? 1 : 0;
    changes.push({ from: a, to: a + inStart + pad }, { from: b - inEnd - pad, to: b });
    return;
  }
  const before = runBefore(text, ia, '`');
  if (inStart === 0 && inEnd === 0 && before > 0 && before === runAfter(text, ib, '`')) {
    changes.push({ from: a - before, to: a }, { from: b, to: b + before });
    return;
  }
  const fence = '`'.repeat(longestRun(body, '`') + 1);
  const pad = body.startsWith('`') || body.endsWith('`') ? ' ' : '';
  changes.push({ from: a, insert: fence + pad }, { from: b, insert: pad + fence });
}

function toggleInline(
  state: EditorState,
  toggle: (from: number, to: number, changes: ChangeSpec[]) => void,
  emptyMarker: string,
): TransactionSpec | null {
  return forEachRange(state, (range) => {
    const changes: ChangeSpec[] = [];
    if (range.empty) {
      const word = wordAt(state, range.head);
      if (!word) {
        return {
          changes: [{ from: range.head, insert: emptyMarker + emptyMarker }],
          range: EditorSelection.cursor(range.head + emptyMarker.length),
        };
      }
      toggle(word.from, word.to, changes);
      // Keep the cursor inside the word, including when it sat at the word's end.
      return { changes, range: mapRange(state, changes, range, range.head === word.to ? -1 : 1) };
    }
    const { first, last } = touchedLines(state, range);
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      toggle(Math.max(range.from, line.from), Math.min(range.to, line.to), changes);
    }
    return { changes, range: mapRange(state, changes, range, 1, -1) };
  });
}

/** Toggles bold (`**`) on the selection, or on the word under the cursor. */
export function toggleBold(state: EditorState): TransactionSpec | null {
  return toggleInline(state, (f, t, c) => toggleSpan(state, f, t, BOLD, c), '**');
}

/** Toggles italic (`*`) on the selection, or on the word under the cursor. */
export function toggleItalic(state: EditorState): TransactionSpec | null {
  return toggleInline(state, (f, t, c) => toggleSpan(state, f, t, ITALIC, c), '*');
}

/** Toggles strikethrough (`~~`) on the selection, or on the word under the cursor. */
export function toggleStrikethrough(state: EditorState): TransactionSpec | null {
  return toggleInline(state, (f, t, c) => toggleSpan(state, f, t, STRIKETHROUGH, c), '~~');
}

/** Toggles inline code on the selection, or on the word under the cursor. */
export function toggleInlineCode(state: EditorState): TransactionSpec | null {
  return toggleInline(state, (f, t, c) => toggleCodeSpan(state, f, t, c), '`');
}

/** Turns the selection (or the word under the cursor) into `[text](url)` with `url` selected; a
 * selected URL becomes `[](url)` with the cursor in the brackets. */
export function insertLink(state: EditorState): TransactionSpec | null {
  return forEachRange(state, (range) => {
    let { from, to } = range;
    if (range.empty) {
      const word = wordAt(state, range.head);
      if (word) ({ from, to } = word);
    }
    const text = state.doc.sliceString(from, to);
    if (text === '' || URL_LIKE.test(text)) {
      const insert = `[](${text || 'url'})`;
      return { changes: [{ from, to, insert }], range: EditorSelection.cursor(from + 1) };
    }
    const urlStart = from + text.length + 3;
    return {
      changes: [{ from, to, insert: `[${text}](url)` }],
      range: EditorSelection.range(urlStart, urlStart + 3),
    };
  });
}

// ---- Blocks ------------------------------------------------------------------------------

/** The fenced code block around `pos`, if there is one. */
function fencedCodeAt(state: EditorState, pos: number): { from: number; to: number } | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  for (const side of [1, -1] as const) {
    for (let node = tree.resolveInner(pos, side); ; node = node.parent) {
      if (node.name === 'FencedCode') return { from: node.from, to: node.to };
      if (!node.parent) break;
    }
  }
  return null;
}

/** Removes the fences of the code block the selection is in, or wraps the touched lines in a
 * new one with the cursor after the opening fence (to type a language). */
export function toggleCodeBlock(state: EditorState): TransactionSpec | null {
  return forEachRange(state, (range) => {
    const doc = state.doc;
    const block = fencedCodeAt(state, range.from) ?? fencedCodeAt(state, range.to);
    if (block) {
      const open = doc.lineAt(block.from);
      const close = doc.lineAt(block.to);
      const closed = close.number > open.number && FENCE_LINE.test(close.text);
      const changes: ChangeSpec[] =
        closed && close.number === open.number + 1
          ? [{ from: open.from, to: close.to }]
          : [{ from: open.from, to: Math.min(open.to + 1, doc.length) }];
      if (closed && close.number > open.number + 1) {
        changes.push({ from: close.from - 1, to: close.to });
      }
      return { changes, range: mapRange(state, changes, range) };
    }
    const { first, last } = touchedLines(state, range);
    const from = doc.line(first).from;
    const to = doc.line(last).to;
    const body = doc.sliceString(from, to);
    const fence = '`'.repeat(Math.max(3, longestRun(body, '`') + 1));
    return {
      changes: [{ from, to, insert: `${fence}\n${body}\n${fence}` }],
      range: EditorSelection.cursor(from + fence.length),
    };
  });
}

/** Removes one quote level when every non-blank touched line is quoted, otherwise quotes every
 * touched line (blank lines get a bare `>` so the quote stays one block). */
export function toggleQuote(state: EditorState): TransactionSpec | null {
  return forEachRange(state, (range) => {
    const { first, last } = touchedLines(state, range);
    const lines = [];
    for (let n = first; n <= last; n++) lines.push(state.doc.line(n));
    const nonBlank = lines.filter((l) => !isBlank(l.text));
    if (nonBlank.length === 0) return { range };
    const quoted = nonBlank.every((l) => /^[ \t]*>/.test(l.text));
    const changes: ChangeSpec[] = [];
    for (const line of lines) {
      if (quoted) {
        const m = /^([ \t]*)>[ \t]?/.exec(line.text);
        if (m) changes.push({ from: line.from + m[1].length, to: line.from + m[0].length });
      } else if (isBlank(line.text)) {
        changes.push({ from: line.from, to: line.to, insert: '>' });
      } else {
        changes.push({ from: line.from, insert: '> ' });
      }
    }
    return { changes, range: mapRange(state, changes, range) };
  });
}

type ListKind = 'bullet' | 'ordered' | 'task';

const LIST_MARKERS: readonly [ListKind, RegExp][] = [
  // Task first: a task line also looks like a bullet.
  ['task', TASK_MARKER],
  ['ordered', ORDERED_MARKER],
  ['bullet', BULLET_MARKER],
];

/** The list marker on `text` (after any quote markers): its kind and where it starts and ends. */
function listMarker(text: string): { kind: ListKind; start: number; end: number } | null {
  const quote = QUOTE_PREFIX.exec(text)![0].length;
  const rest = text.slice(quote);
  for (const [kind, re] of LIST_MARKERS) {
    const m = re.exec(rest);
    if (m) return { kind, start: quote + m[1].length, end: quote + m[0].length };
  }
  return null;
}

/** Removes the `kind` list markers when every non-blank touched line has one, otherwise gives
 * every non-blank line a `kind` marker (replacing other list markers). Numbers run from 1. */
export function toggleList(state: EditorState, kind: ListKind): TransactionSpec | null {
  return forEachRange(state, (range) => {
    const { first, last } = touchedLines(state, range);
    const lines = [];
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      if (!isBlank(line.text)) lines.push({ line, marker: listMarker(line.text) });
    }
    if (lines.length === 0) return { range };
    const remove = lines.every((l) => l.marker?.kind === kind);
    const changes: ChangeSpec[] = [];
    let number = 1;
    for (const { line, marker } of lines) {
      if (remove && marker) {
        changes.push({ from: line.from + marker.start, to: line.from + marker.end });
        continue;
      }
      const insert = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${number++}. `;
      if (marker) {
        changes.push({ from: line.from + marker.start, to: line.from + marker.end, insert });
      } else {
        const indent = /^(?:[ \t]*>[ \t]?)*[ \t]*/.exec(line.text)![0].length;
        changes.push({ from: line.from + indent, insert });
      }
    }
    return { changes, range: mapRange(state, changes, range) };
  });
}

/** Inserts `---` on its own line after the cursor's line, with a blank line on each side so it
 * can't turn the paragraph above into a setext heading. */
export function insertHorizontalRule(state: EditorState): TransactionSpec | null {
  return forEachRange(state, (range) => {
    const doc = state.doc;
    const line = doc.lineAt(range.head);
    const next = line.number < doc.lines ? doc.line(line.number + 1) : null;
    if (isBlank(line.text)) {
      const prev = line.number > 1 ? doc.line(line.number - 1) : null;
      const before = prev && !isBlank(prev.text) ? '\n' : '';
      const after = next && !isBlank(next.text) ? '\n' : '';
      return {
        changes: [{ from: line.from, to: line.to, insert: `${before}---${after}` }],
        range: EditorSelection.cursor(line.from + before.length + 3),
      };
    }
    const insert = next && isBlank(next.text) ? '\n\n---' : '\n\n---\n';
    return {
      changes: [{ from: line.to, insert }],
      range: EditorSelection.cursor(line.to + 5),
    };
  });
}
