import type { MarkdownIt, Token, StateCore } from 'markdown-it';

/**
 * Adds `data-line="<start>"` to every block-level opening token so the preview can be
 * mapped back to source lines (used by scroll sync and view switching).
 */
export function sourceLines(md: MarkdownIt): void {
  md.core.ruler.push('source_lines', (state: StateCore) => {
    for (const token of state.tokens) {
      if (token.map && token.nesting !== -1 && token.type !== 'inline') {
        token.attrSet('data-line', String(token.map[0]));
        token.attrSet('data-line-end', String(token.map[1]));
      }
    }
  });
}

/** GitHub-style task lists: `- [ ]` / `- [x]` become disabled checkboxes. */
export function taskLists(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'task_lists', (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue;
      if (tokens[i - 2].type !== 'list_item_open') continue;
      const first = t.children?.[0];
      if (!first || first.type !== 'text') continue;
      const m = /^\[([ xX])\]\s/.exec(first.content);
      if (!m) continue;

      const checked = m[1] !== ' ';
      first.content = first.content.slice(m[0].length);

      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = `<input class="task-list-item-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}> `;
      t.children!.unshift(checkbox);

      tokens[i - 2].attrJoin('class', 'task-list-item');
      // walk back to the enclosing list to tag it
      for (let j = i - 3; j >= 0; j--) {
        if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
          if (!String(tokens[j].attrGet('class') ?? '').includes('contains-task-list')) {
            tokens[j].attrJoin('class', 'contains-task-list');
          }
          break;
        }
      }
    }
  });
}

const HEX_DIGITS = /^[0-9a-f]+$/i;

/** Valid HEX colour syntax: `#` plus exactly 3, 4, 6 or 8 hex digits (case-insensitive). */
export function isHexColor(text: string): boolean {
  const t = text.trim();
  if (t[0] !== '#') return false;
  const digits = t.slice(1);
  return (
    (digits.length === 3 || digits.length === 4 || digits.length === 6 || digits.length === 8) &&
    HEX_DIGITS.test(digits)
  );
}

export interface HexMatch {
  index: number;
  length: number;
  hex: string;
}

// A `#` not preceded by a letter, digit, `&` or another `#` (so `C#`, `&#123;` and `##abc`
// don't match), followed by a run of hex digits, not followed by another letter, digit or `_`
// (so `#abcdefg` and `#abc_` don't match).
const HEX_CANDIDATE = /(?<![A-Za-z0-9&#])#([0-9a-fA-F]+)(?![A-Za-z0-9_])/g;
const HAS_HEX_LETTER = /[a-f]/i;

/**
 * Finds HEX colour codes in plain text. 6- and 8-digit codes always count; 3- and 4-digit codes
 * only when at least one digit is a letter a-f, so issue numbers like `#123` or `#2024` are left
 * alone. (Inline code has no such restriction: see `isHexColor`.)
 */
export function findHexColors(text: string): HexMatch[] {
  const matches: HexMatch[] = [];
  HEX_CANDIDATE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEX_CANDIDATE.exec(text))) {
    const digits = m[1];
    if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) {
      continue;
    }
    if ((digits.length === 3 || digits.length === 4) && !HAS_HEX_LETTER.test(digits)) {
      continue;
    }
    matches.push({ index: m.index, length: m[0].length, hex: `#${digits}` });
  }
  return matches;
}

/**
 * Core rule (runs after `inline`): finds HEX colour codes in inline code and plain text.
 * For inline code, marks the `code_inline` token itself (`meta.hexSwatch`) so the renderer can
 * append the swatch inside the same `<code>` pill, after the code text. For plain text, splits
 * the text token and inserts a `color_swatch` token right after the code, for the renderer to
 * turn into a small colour square. Never inside link text (tracked via link_open/link_close
 * depth).
 */
export function hexSwatches(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'hex_swatches', (state: StateCore) => {
    for (const token of state.tokens) {
      if (token.type === 'inline' && token.children) {
        token.children = expandInlineChildren(state, token.children);
      }
    }
  });
}

function expandInlineChildren(state: StateCore, children: Token[]): Token[] {
  const result: Token[] = [];
  let linkDepth = 0;
  for (const child of children) {
    if (child.type === 'link_open') linkDepth++;
    else if (child.type === 'link_close') linkDepth = Math.max(0, linkDepth - 1);

    if (linkDepth === 0 && child.type === 'code_inline' && isHexColor(child.content)) {
      child.meta = { ...(child.meta as object | null), hexSwatch: child.content.trim() };
      result.push(child);
      continue;
    }

    if (linkDepth === 0 && child.type === 'text' && child.content) {
      const matches = findHexColors(child.content);
      if (matches.length > 0) {
        result.push(...splitTextToken(state, child, matches));
        continue;
      }
    }

    result.push(child);
  }
  return result;
}

/** Splits a text token's content around each match, keeping the code's own text in the text
 * token and inserting a `color_swatch` token right after it. */
function splitTextToken(state: StateCore, token: Token, matches: HexMatch[]): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const match of matches) {
    const end = match.index + match.length;
    const textPart = token.content.slice(last, end);
    if (textPart) out.push(makeTextToken(state, token.level, textPart));
    out.push(makeSwatchToken(state, token.level, match.hex));
    last = end;
  }
  const tail = token.content.slice(last);
  if (tail) out.push(makeTextToken(state, token.level, tail));
  return out;
}

function makeTextToken(state: StateCore, level: number, content: string): Token {
  const t = new state.Token('text', '', 0);
  t.level = level;
  t.content = content;
  return t;
}

function makeSwatchToken(state: StateCore, level: number, hex: string): Token {
  const t = new state.Token('color_swatch', '', 0);
  t.level = level;
  t.meta = { hex };
  return t;
}

export interface HeadingInfo {
  level: number;
  text: string;
  id: string;
  line: number;
}

/**
 * Matches github-slugger (GitHub's own heading-id algorithm): lowercase, drop
 * everything except letters, marks, numbers, connector punctuation (`_`), spaces
 * and `-`, then turn each space into a `-` (no collapsing, no extra trimming).
 */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-') || 'section'
  );
}

/** Extract plain text from an inline token's children. */
function inlineText(token: Token): string {
  if (!token.children) return token.content;
  return token.children
    .map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : ''))
    .join('');
}

/**
 * Assigns deduplicated slug `id`s to headings and records them into `env.headings`
 * so the outline can be built from the same parse.
 */
export function headingIds(md: MarkdownIt): void {
  md.core.ruler.push('heading_ids', (state: StateCore) => {
    const headings: HeadingInfo[] = [];
    // GitHub appends -1, -2, ... and never reuses an id, even one produced by a
    // dedup suffix (so "foo", "foo", "foo-1" give foo, foo-1, foo-1-1).
    const used = new Set<string>();
    const counters = new Map<string, number>();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'heading_open') continue;
      const inline = tokens[i + 1];
      const text = inline?.type === 'inline' ? inlineText(inline) : '';
      const base = slugify(text);
      let id = base;
      while (used.has(id)) {
        const n = (counters.get(base) ?? 0) + 1;
        counters.set(base, n);
        id = `${base}-${n}`;
      }
      used.add(id);
      t.attrSet('id', id);
      headings.push({ level: Number(t.tag.slice(1)), text, id, line: t.map?.[0] ?? 0 });
    }
    (state.env as { headings?: HeadingInfo[] }).headings = headings;
  });
}
