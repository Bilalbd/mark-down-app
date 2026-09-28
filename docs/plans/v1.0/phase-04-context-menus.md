# Phase 4: Right-click menus for the editor and the preview

Replace the WebView2 default right-click menu with the app's own menus: a full menu in the source
editor (spelling + clipboard + formatting) and a small one in the formatted view.

## Step 0: record what happens today

Before changing anything, right-click in the editor, in the preview, on the title bar and in a
Settings text field in the dev app, and record which native menu items appear (a PrintWindow
capture of the popup window, or at least the item list if it can be read). Note in the Report
whether **Refresh** / **Back** / **Reload** are there: those would reload the webview and lose
unsaved work.

## Menus

**Source editor** (Source view and the editor pane of Split):

```
<suggestion 1>                      ← only on a misspelled word, up to 5, bold
<suggestion 2>
…                                   ← "No suggestions" (disabled) when there are none
Add to dictionary
Ignore
──────────
Cut                     Ctrl+X      ← disabled with no selection
Copy                    Ctrl+C      ← disabled with no selection
Paste                   Ctrl+V
Select all              Ctrl+A
──────────
Heading              ▸  Heading 1 … Heading 6 (Ctrl+Shift+1…6), Paragraph (Ctrl+Shift+0)
Bold                    Ctrl+B
Italic                  Ctrl+I
Strikethrough
Inline code
Link                    Ctrl+K
──────────
Code block
Quote
Bulleted list
Numbered list
Task list
Horizontal rule
```

Leave out Paragraph's shortcut text if Phase 3 dropped `Ctrl+Shift+0`. Icons from `lucide-react`
with the shared `ICON` props at 14 px (as `TabContextMenu` does): `Heading`, `Bold`, `Italic`,
`Strikethrough`, `Code`, `Link`, `SquareCode`, `TextQuote`, `List`, `ListOrdered`, `ListTodo`,
`Minus`, `Scissors`, `Copy`, `ClipboardPaste`, `BookPlus` (Add to dictionary), `EyeOff` (Ignore).
Check each name exists in the installed `lucide-react` version and pick the closest if not.

**Formatted view** (and the preview pane of Split): Copy (disabled with no selection inside the
preview) and Select all (selects the preview's content only, not the whole window).

**Everywhere else:** the default menu is suppressed (`preventDefault` on `contextmenu` at the
document level), **except** in `<input>` and `<textarea>` elements, which keep the native editing
menu. The tab strip keeps its own menu.

## Behaviour

- **Placement:** right-click inside the selection keeps the selection; outside, the cursor moves to
  the click position (`view.posAtCoords`) first. The menu opens at the pointer and is kept inside
  the window with the existing `menuPosition` helper (`src/lib/tabs.ts`).
- **Keyboard:** the **Menu** key and **Shift+F10** open the editor menu at the cursor
  (`view.coordsAtPos`). In the menu: Up/Down (skipping disabled items and separators), Home/End,
  Enter/Space to activate, Right to open the Heading submenu and Left to close it, Escape to close
  (returning focus to the editor). Clicking outside, window blur, scrolling or resizing closes it.
- **Suggestions:** `misspellingAt` (Phase 2) finds the word under the click; `spellSuggest` is
  called before the menu opens. If it hasn't answered within 150 ms, open the menu with
  "No suggestions" rather than waiting (and don't update it later).
- **Actions:** a suggestion replaces the word (one undo step). *Add to dictionary* appends the word
  to `spellWords` (persisted). *Ignore* adds it to the view store's ignore set. Formatting items
  call the Phase 3 commands. Cut/Copy use `navigator.clipboard.writeText`; Paste uses
  `navigator.clipboard.readText` and inserts through a transaction. Every action returns focus to
  the editor.
- **Clipboard in WebView2:** check in the real app that `readText` works without a permission
  prompt. If it doesn't, use the official `@tauri-apps/plugin-clipboard-manager` with **only**
  `clipboard-manager:allow-read-text` and `clipboard-manager:allow-write-text` in
  `capabilities/default.json`, wrap it in `src/lib/tauri.ts`, and give the reason in the commit
  message. Nothing broader.
- **Accessibility:** `role="menu"`, `role="menuitem"`, `aria-haspopup="menu"` and `aria-expanded`
  on Heading, `role="separator"`, and shortcut text in a separate element with `aria-hidden` (put
  the shortcut in `aria-keyshortcuts` instead).

## Files

- `src/components/ContextMenu/ContextMenu.tsx`, `ContextMenu.css`, `ContextMenu.test.tsx` (new): a
  generic, data-driven menu (items with label, icon, shortcut text, disabled, bold, submenu;
  separators), rendered in a portal, styled with `--chrome-*` tokens to match the tab menu in both
  themes. Don't change `TabContextMenu` in this phase (moving it onto the shared component is a
  follow-up; put it in the Report).
- `src/lib/editorMenu.ts` (+ test): `buildEditorMenu(ctx)` returns the item model from
  `{ misspelling, suggestions, hasSelection, pasteShortcut }` etc. and the action ids, so the menu
  contents are unit-tested without a DOM.
- `src/components/Editor/SourceEditor.tsx`: the `contextmenu` and key handlers, menu state, actions.
- `src/components/Preview/Preview.tsx`: the preview menu.
- `src/App.tsx` (or `main.tsx`, whichever already owns document-level listeners): the global
  suppression.
- `README.md`: a line about the right-click menus.

## Tasks

- [ ] **0.** Step 0 above.
- [ ] **1.** `ContextMenu` component and tests (renders items, disabled items skipped by arrows,
  Enter activates, submenu opens with Right and closes with Left, Escape calls `onClose`, outside
  mousedown closes, position clamped).
- [ ] **2.** `buildEditorMenu` and tests (with/without misspelling, no suggestions, no selection).
- [ ] **3.** Editor menu wiring.
- [ ] **4.** Preview menu and global suppression.
- [ ] **5.** README.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format` (and `cargo check` if the
  clipboard plugin was added).
- [ ] Dev app with a copy of `fixtures/spelling.md`, **light and dark** screenshots of: the editor
  menu on a misspelled word, the Heading submenu open, the formatted-view menu.
- [ ] Choose a suggestion → word replaced; `Ctrl+Z` restores it. *Add to dictionary* → squiggle
  gone in every tab and the word listed in Settings. *Ignore* → squiggle gone until restart.
- [ ] Each formatting item once, through the menu (click and keyboard), checking the text.
- [ ] Cut, Copy, Paste and Select all against the real clipboard (write a known string with
  PowerShell `Set-Clipboard` first; read it back with `Get-Clipboard`).
- [ ] Menu key and Shift+F10 open the menu at the cursor.
- [ ] Right-click on the title bar, toolbar, outline and status bar: no native menu. A Settings text
  field: native editing menu still there. Tab: tab menu unchanged.
- [ ] Split view: each pane shows its own menu.
- [ ] Commit: `Add right-click menus for the editor and preview`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
