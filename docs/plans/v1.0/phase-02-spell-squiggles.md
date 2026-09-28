# Phase 2: Squiggles in the editor and Spelling settings

Underline misspelled words with a red wavy line in the source editor (Source view and the editor
side of Split), using Phase 1's engine. Add a **Spelling** section to Settings → General.

## Behaviour

- **Where:** the CodeMirror source editor only. No squiggles in the formatted view.
- **What's checked:** prose only. Skip fenced and indented code, inline code, URLs and autolinks
  (including bare GFM autolinks), link and image destinations, reference definitions
  (`[x]: http…`), HTML tags and comments, maths (`$…$` and `$$…$$`, the same delimiters the
  renderer accepts), a YAML front matter block at the very top (`---` … `---`), and HEX colour
  codes (`#AA00BB`). Link text, image alt text, headings, table cells, list items and quotes *are*
  checked.
- **When:** after the user stops typing for 400 ms, and after scrolling (the visible lines plus 50
  lines above and below). Never on every keystroke. Existing squiggles are mapped through edits
  (`decorations.map(tr.changes)`) so they don't jump while the next check is pending.
- **The word being typed** (the word the cursor touches) isn't underlined until the cursor leaves
  it.
- **Cache:** results are cached per (languages, prose segment text), so scrolling back or retyping
  a line doesn't ask Rust again. Cap the cache (e.g. 5,000 entries; clear it when full). Clear it
  when the languages change. Responses from an older request (a sequence number) are dropped.
- **Personal dictionary and Ignore:** words in `spellWords` (settings) and in the window's ignore
  set (view store) are never underlined. Compare case-insensitively (`toLocaleLowerCase()`).
- **Failure:** if a `spellCheck` call rejects, show no squiggles for that pass and try again on the
  next change. Don't show an error (spell check is a hint, not a document operation). Write that
  reason in a comment.
- **Performance:** typing in `fixtures/huge.md` must feel the same with spell check on as off.

## Settings

Add to `Settings` and `DEFAULTS` in `src/store/settings.ts`:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `spellCheck` | `boolean` | `true` | Underline misspelled words in the source editor |
| `spellLanguages` | `string[]` | `[]` | Ticked languages; `[]` means "automatic" (see below) |
| `spellWords` | `string[]` | `[]` | Personal dictionary |

**Automatic languages** (`[]`): the supported tag that best matches `navigator.language` (exact
tag, else same primary language, e.g. `en-GB` → `en-US`), else `en-US` if supported, else the
first supported tag, else none.

Settings → General gets a **Spelling** section after the Editor section:

- **Check spelling**: toggle (`spellCheck`).
- **Languages**: one checkbox per tag from `spellLanguages()`, labelled with
  `new Intl.DisplayNames([navigator.language], { type: 'language' }).of(tag)` (e.g. "English
  (United States)"), sorted by label. With `spellLanguages` empty, the automatic languages show as
  ticked. The first change writes the explicit list. Unticking the last one is allowed (no
  squiggles). Disabled while *Check spelling* is off.
- If Windows has no spelling languages (or Tauri isn't there): a hint instead of the list:
  *"Windows has no spelling dictionaries installed. Add a language in Windows Settings → Time &
  language → Language & region."*
- **Personal dictionary**: the words, each with a remove button (`aria-label="Remove <word>"`,
  lucide `X` with the shared icon props), or *"No words added yet."* A word is added from the
  right-click menu (Phase 4); for this phase, adding is tested through the store.

Reuse the existing Settings controls (`controls.tsx`) and CSS classes; add only what's missing.

## Files

- `src/lib/spell.ts` (new): pure helpers. `effectiveSpellLanguages(saved, supported, navLang)`,
  `languageLabel(tag, uiLang)`, `isKnownWord(word, spellWords, ignored)`, and the cache (a small
  class or closure, testable).
- `src/lib/proseRanges.ts` (new): `proseRanges(tree: Tree, doc: string, from: number, to: number):
  { from: number; to: number }[]`: the parts of `doc` in `[from, to)` that should be checked, from
  the `@lezer/markdown` tree (node names such as `FencedCode`, `CodeBlock`, `InlineCode`, `URL`,
  `Autolink`, `LinkReference`, `HTMLTag`, `HTMLBlock`, `Comment`) plus regex exclusions for maths,
  front matter and HEX codes (the parser doesn't know those). Check the exact node names against
  the parser rather than trusting this list.
- `src/components/Editor/spellcheck.ts` (new): the CodeMirror extension (a `ViewPlugin` that
  schedules checks and a `StateField` holding a `DecorationSet` of `Decoration.mark({ class:
  'cm-misspelled' })`), plus `misspellingAt(state, pos): { from: number; to: number; word: string }
  | null` for Phase 4. Wire only; the logic lives in the two `lib/` files.
- `src/components/Editor/SourceEditor.tsx`: add the extension through a `Compartment`, reconfigured
  when `spellCheck`, the effective languages or `spellWords` change (same pattern as the gutter
  compartment).
- Squiggle style: `text-decoration: underline wavy var(--spell-error)`, `text-decoration-skip-ink:
  none`, a small `text-underline-offset`. Put it where the editor's other styles live (read
  `editorTheme.ts` and `SourceEditor.css` first). New token `--spell-error` in
  `src/styles/app-theme.css` with **a light and a dark value** (a clear red that passes on both
  editor backgrounds).
- `src/store/settings.ts` (+ tests), `src/store/view.ts` (ignore set:
  `spellIgnored: ReadonlySet<string>`, `ignoreWord(word)`; never saved).
- `src/components/Settings/GeneralTab.tsx` (+ `GeneralTab.test.tsx`).
- `fixtures/spelling.md` (new): English prose with some mistakes; an Arabic paragraph with one
  mistake; a mixed English and Arabic line; and one example of each thing that must *not* be
  underlined (code block, inline code, bare URL, link with a misspelled label and a URL, image,
  reference definition, HTML tag, inline and block maths, front matter, a HEX code), each with a
  deliberately "misspelled" token inside.
- `README.md`: a Spell check bullet.

## Tasks

- [ ] **1.** `proseRanges.ts` + tests: parse with `markdownLanguage.parser.parse(text)` (the same
  GFM parser the editor uses) and assert the ranges for each excluded construct and a few
  included ones (heading text, link label, table cell, list item).
- [ ] **2.** `spell.ts` + tests: automatic language choice (exact, primary-language match,
  `en-US` fallback, none), labels, `isKnownWord` (case-insensitive, both sources), cache
  (hit, miss, cap, clear on language change).
- [ ] **3.** Settings keys + tests (defaults, persistence like the other array keys).
- [ ] **4.** The CodeMirror extension and its wiring in `SourceEditor.tsx`.
- [ ] **5.** Spelling section in Settings, with tests (toggle, checklist from a mocked
  `spellLanguages`, automatic ticks, empty-list hint, removing a personal word).
- [ ] **6.** `fixtures/spelling.md`, README bullet.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`, `cargo check` (no Rust changes
  expected).
- [ ] Dev app, a copy of `fixtures/spelling.md`, Source view, **light and dark** screenshots: the
  English and Arabic mistakes are underlined; nothing in the "must not" examples is; the mixed line
  is clean when both languages are ticked and the Arabic word is underlined with English only.
- [ ] Split view: squiggles in the editor pane only.
- [ ] Settings: toggle off removes all squiggles at once; toggling back restores them. Ticking and
  unticking languages updates the squiggles without reopening the file.
- [ ] Add a word to `spellWords` through the store (`{ persist: false }`); its squiggles disappear
  in every open tab.
- [ ] Typing: type a misspelled word; no squiggle while the cursor is on it; it appears after the
  cursor moves on and 400 ms pass.
- [ ] `fixtures/huge.md` (copy): type 30 characters at the end and in the middle, and scroll from
  top to bottom, with spell check on and off. Report keystroke-to-paint timings (a
  `performance.now()` measurement around dispatch + `requestAnimationFrame`) and the number of
  `spell_check` calls made while scrolling.
- [ ] Commit: `Underline misspelled words in the source editor`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
