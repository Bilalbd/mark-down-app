import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { spellCheck, type SpellError } from '@/lib/tauri';
import { isKnownWord, SpellCache } from '@/lib/spell';
import { proseRanges, splitRangesByLine } from '@/lib/proseRanges';
import { useViewStore } from '@/store/view';

/** Wait this long after the triggering edit, scroll or cursor move before asking Rust - long
 * enough that typing and scrolling never fire a request per event, per CLAUDE.md's "rendering
 * stays debounced and fast". It also gives the word under the cursor time to stop being "the
 * word being typed" before it can be flagged (see `wordAt` below). */
const DEBOUNCE_MS = 400;

/** How far beyond the visible viewport (in lines) to check, so a small scroll is usually already
 * covered by the previous check's window. */
const VIEWPORT_MARGIN_LINES = 50;

/** Budget given to `ensureSyntaxTree` for the (small, windowed) range we need parsed - generous
 * enough to finish on any realistic window, but bounded so a pathological document can't stall
 * a check indefinitely; `syntaxTree` (whatever's already parsed) is used if it times out. */
const PARSE_TIMEOUT_MS = 100;

const setSpellDecorations = StateEffect.define<DecorationSet>();

const spellDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSpellDecorations)) decorations = effect.value;
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const misspelledMark = Decoration.mark({ class: 'cm-misspelled' });

const WORD_CHAR = /[\p{L}\p{N}']/u;

/** The word touching `pos` (the caret), or `null` if neither the character before nor after it
 * is a word character - used to hide the squiggle under the word currently being typed. */
function wordAt(text: string, pos: number): { from: number; to: number } | null {
  const before = pos > 0 ? text[pos - 1] : '';
  const after = pos < text.length ? text[pos] : '';
  if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return null;
  let from = pos;
  while (from > 0 && WORD_CHAR.test(text[from - 1])) from--;
  let to = pos;
  while (to < text.length && WORD_CHAR.test(text[to])) to++;
  return { from, to };
}

interface Segment {
  from: number;
  to: number;
  text: string;
}

class SpellCheckPlugin implements PluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private readonly cache = new SpellCache();

  constructor(
    private view: EditorView,
    private readonly languages: readonly string[],
    private readonly spellWords: readonly string[],
  ) {
    // A freshly mounted or `setState`-loaded document never fired an update for us, so run
    // once right away instead of waiting for the first edit or scroll.
    this.schedule(0);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.schedule(DEBOUNCE_MS);
    }
  }

  destroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private async run(): Promise<void> {
    const mySeq = ++this.seq;
    const state = this.view.state;
    const doc = state.doc;

    const viewport = this.view.viewport;
    const fromLine = Math.max(1, doc.lineAt(viewport.from).number - VIEWPORT_MARGIN_LINES);
    const toLine = Math.min(doc.lines, doc.lineAt(viewport.to).number + VIEWPORT_MARGIN_LINES);
    const from = doc.line(fromLine).from;
    const to = doc.line(toLine).to;
    if (from >= to) return;

    const tree = ensureSyntaxTree(state, to, PARSE_TIMEOUT_MS) ?? syntaxTree(state);
    const text = doc.toString();
    const ranges = proseRanges(tree, text, from, to);
    const segments: Segment[] = splitRangesByLine(text, ranges)
      .filter((r) => r.to > r.from)
      .map((r) => ({ from: r.from, to: r.to, text: text.slice(r.from, r.to) }));

    const toFetch: Segment[] = [];
    const resolved: { from: number; errors: SpellError[] }[] = [];
    for (const seg of segments) {
      const cached = this.cache.get(this.languages, seg.text);
      if (cached) resolved.push({ from: seg.from, errors: cached });
      else toFetch.push(seg);
    }

    if (toFetch.length > 0) {
      let results: SpellError[][];
      try {
        results = await spellCheck(
          toFetch.map((s) => s.text),
          [...this.languages],
        );
      } catch {
        // Spell check is a hint, not a document operation: show nothing for this pass and let
        // the next scheduled check (the next edit or scroll) try again.
        return;
      }
      if (mySeq !== this.seq) return; // a newer check has since started; drop this reply
      toFetch.forEach((seg, i) => {
        this.cache.set(this.languages, seg.text, results[i]);
        resolved.push({ from: seg.from, errors: results[i] });
      });
    } else if (mySeq !== this.seq) {
      return;
    }

    const spellWords = this.spellWords;
    const ignored = useViewStore.getState().spellIgnored;
    const selection = state.selection.main;
    const cursorWord = selection.empty ? wordAt(text, selection.head) : null;

    const marks: { from: number; to: number }[] = [];
    for (const seg of resolved) {
      for (const e of seg.errors) {
        const from2 = seg.from + e.start;
        const to2 = from2 + e.length;
        if (to2 <= from2) continue;
        if (cursorWord && from2 < cursorWord.to && to2 > cursorWord.from) continue;
        const word = text.slice(from2, to2);
        if (isKnownWord(word, spellWords, ignored)) continue;
        marks.push({ from: from2, to: to2 });
      }
    }
    marks.sort((a, b) => a.from - b.from || a.to - b.to);

    this.view.dispatch({
      effects: setSpellDecorations.of(
        Decoration.set(
          marks.map((m) => misspelledMark.range(m.from, m.to)),
          true,
        ),
      ),
    });
  }
}

/** The squiggle extension: pass the effective languages (already resolved from "automatic" if
 * the user hasn't ticked any) and the personal dictionary. Install through a `Compartment`,
 * reconfigured whenever spell check is turned off, the effective languages change, or the
 * personal dictionary changes (an empty `languages` array means "don't install this at all",
 * which callers do by reconfiguring to `[]` instead of calling this with an empty array). */
export function spellcheckExtension(languages: string[], spellWords: string[]): Extension {
  return [
    spellDecorationsField,
    ViewPlugin.define((view) => new SpellCheckPlugin(view, languages, spellWords)),
  ];
}

/** The misspelling at `pos` (its range and the word itself), for the right-click menu (Phase 4).
 * `null` if spell check isn't installed or nothing is flagged there. */
export function misspellingAt(
  state: EditorState,
  pos: number,
): { from: number; to: number; word: string } | null {
  const decorations = state.field(spellDecorationsField, false);
  if (!decorations) return null;
  let found: { from: number; to: number } | null = null;
  decorations.between(pos, pos, (from, to) => {
    found = { from, to };
    return false;
  });
  if (!found) return null;
  const { from, to }: { from: number; to: number } = found;
  return { from, to, word: state.sliceDoc(from, to) };
}
