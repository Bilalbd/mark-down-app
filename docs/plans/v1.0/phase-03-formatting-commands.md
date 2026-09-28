# Phase 3: Formatting commands and shortcuts

Write the Markdown formatting commands the right-click menu (Phase 4) will call, and bind the
keyboard shortcuts. No menu in this phase.

## Commands

All commands take an `EditorState` and return a `TransactionSpec` (or `null` when there's nothing
to do), so they're pure and testable without a DOM. They work on **every selection range**
(`state.changeByRange`), produce **one transaction** (one undo step) with
`userEvent: 'input.format'`, and leave a sensible selection (listed per command).

| Command | Behaviour |
|---|---|
| `setHeading(level: 0–6)` | For every line the selection touches: remove an existing ATX marker (`#`–`######` + space) and add `level` `#`s + a space (0 = Paragraph, just removes it). Applying the level a line already has turns it back into a paragraph (toggle). Keep a leading blockquote `> ` or list marker and put the `#`s after it. Setext headings are left alone. |
| `toggleBold` / `toggleItalic` / `toggleStrikethrough` | Wrap with `**` / `*` / `~~`. Already wrapped (markers just inside **or** just outside the selection) → unwrap. Leading/trailing spaces in the selection stay outside the markers. Empty selection → the word under the cursor; no word → insert the pair with the cursor between. Selection spanning lines → apply per non-empty line. Italic on `**bold**` gives `***bold***`, and unwrapping italic from `***x***` gives `**x**` (tests for both). The result keeps the same text selected. |
| `toggleInlineCode` | Same rules with backticks; when the text contains backticks, use a longer run than the longest run inside (and pad with spaces when the text starts or ends with a backtick). |
| `insertLink` | Selection (or word) `text` → `[text](url)` with `url` selected. If the text itself looks like a URL (`https?://…`, `mailto:`), produce `[](text)` with the cursor inside `[]`. Empty, no word → `[](url)` with the cursor inside `[]`. No toggle. |
| `toggleCodeBlock` | Cursor or selection inside a fenced code block (from the syntax tree) → remove its fence lines. Otherwise wrap the touched lines in a fence and put the cursor right after the opening fence (to type a language). The fence is longer than any backtick run inside. Empty line → insert an empty fenced block, cursor after the opening fence. |
| `toggleQuote` | Every non-blank touched line starts with `>` → remove one level. Otherwise prefix every touched line with `> ` (blank lines get `>`). |
| `toggleList(kind: 'bullet' \| 'ordered' \| 'task')` | Every non-blank touched line already has this kind's marker → remove it. Otherwise replace any list marker (`-`, `*`, `+`, `1.`, `1)`, `- [ ]`, `- [x]`) with this kind's, or add one. Ordered numbers run 1., 2., 3. from the first line. Task marker is `- [ ] `. Indentation is kept; blank lines are skipped. |
| `insertHorizontalRule` | Insert `---` on its own line with a blank line before and after (don't add blanks that are already there). Cursor after the rule. |

## Shortcuts (source editor only)

Bound in a CodeMirror keymap with `Prec.high` in `SourceEditor.tsx`, so they win over the default
keymap (CodeMirror's `Mod-i` is *select parent syntax*; this replaces it):

| Keys | Command |
|---|---|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Link |
| `Ctrl+Shift+1` … `Ctrl+Shift+6` | Heading 1–6 (press again to go back to a paragraph) |
| `Ctrl+Shift+0` | Paragraph |

Why not `Ctrl+Alt+digit`: on Windows `Ctrl+Alt` is `AltGr`, and many keyboard layouts type
`{ [ ] }` with `AltGr+digit` (see the README's supervisor decisions). Write that as a short
comment next to the keymap.

**Check `Ctrl+Shift+0` in the real app.** Windows can reserve it for switching input languages, in
which case it never reaches the app. If it doesn't arrive, leave it out of the keymap and the
docs, say so in the Report, and rely on the heading toggle.

These are editor shortcuts, so they live in the CodeMirror keymap rather than `App.tsx`. Make sure
`App.tsx`'s window-level `useShortcuts` doesn't swallow any of them (`ctrl+b`, `ctrl+i`, `ctrl+k`
and `ctrl+shift+<digit>` must not be registered there). They also go in the Settings shortcuts
table (a group headed "Editing (Source view)") and in the README.

## Files

- `src/lib/formatting.ts` (new) + `src/lib/formatting.test.ts`. It imports from
  `@codemirror/state` and `@codemirror/language` (`syntaxTree`, for the code block) only. Tests
  build states with `EditorState.create({ doc, selection, extensions: [markdown({ base:
  markdownLanguage })] })`, and use `ensureSyntaxTree` where the tree is needed.
- `src/components/Editor/SourceEditor.tsx`: the keymap.
- `src/components/Settings/GeneralTab.tsx` (+ test): shortcut rows.
- `README.md`: shortcut table.

## Tasks

- [ ] **1.** `formatting.ts`: the commands in the table, exported, with a one-line JSDoc each.
- [ ] **2.** Tests: at least one per row of the table **and** one per rule in its Behaviour cell
  (toggle on, toggle off, empty selection with a word, empty selection with no word, multi-line,
  multiple cursors, whitespace outside markers, nested `***`, backticks inside code, URL
  selection, list kind switching, ordered numbering, quote with blank lines, code block remove,
  HR blank lines). Each test checks both the resulting text and the resulting selection.
- [ ] **3.** Keymap in `SourceEditor.tsx`.
- [ ] **4.** Settings shortcut rows and README table.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Dev app, Source view, a copy of `fixtures/gfm.md`: send real key events through CDP
  (`Input.dispatchKeyEvent` with `modifiers`, **not** synthetic DOM events, so CodeMirror's key
  handling runs as it does for a person) for every shortcut and check the text after each. One
  `Ctrl+Z` undoes each command completely.
- [ ] `Ctrl+Shift+0` in the real app, as described above.
- [ ] Split view: the shortcuts work in the editor pane; nothing happens with focus in the preview.
- [ ] Commit: `Add Markdown formatting commands and shortcuts`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
