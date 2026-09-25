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
