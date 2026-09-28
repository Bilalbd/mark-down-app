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
Heading              ▸  Heading 1 … Heading 6 (Ctrl+Shift+1…6), Paragraph (no shortcut)
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

Phase 3 dropped `Ctrl+Shift+0` (Bilal's decision: a real press froze the page), so Paragraph has
no shortcut text. Icons from `lucide-react`
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

- [ ] **0.** Step 0 above. **Left for the supervisor** - the dev app hung before rendering (see
  Report), on both the new code and the unmodified pre-Phase-4 code, so the native menu couldn't
  be observed live this session.
- [x] **1.** `ContextMenu` component and tests (renders items, disabled items skipped by arrows,
  Enter activates, submenu opens with Right and closes with Left, Escape calls `onClose`, outside
  mousedown closes, position clamped).
- [x] **2.** `buildEditorMenu` and tests (with/without misspelling, no suggestions, no selection).
- [x] **3.** Editor menu wiring.
- [x] **4.** Preview menu and global suppression.
- [x] **5.** README.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format` (clipboard plugin wasn't needed -
  see Report).
- [ ] Dev app with a copy of `fixtures/spelling.md`, **light and dark** screenshots of: the editor
  menu on a misspelled word, the Heading submenu open, the formatted-view menu. **Left for the
  supervisor** - blocked by the startup hang (see Report).
- [ ] Choose a suggestion → word replaced; `Ctrl+Z` restores it. *Add to dictionary* → squiggle
  gone in every tab and the word listed in Settings. *Ignore* → squiggle gone until restart.
  **Left for the supervisor** - blocked by the startup hang.
- [ ] Each formatting item once, through the menu (click and keyboard), checking the text. **Left
  for the supervisor** - blocked by the startup hang.
- [ ] Cut, Copy, Paste and Select all against the real clipboard (write a known string with
  PowerShell `Set-Clipboard` first; read it back with `Get-Clipboard`). **Left for the
  supervisor** - blocked by the startup hang.
- [ ] Menu key and Shift+F10 open the menu at the cursor. **Left for the supervisor** - blocked by
  the startup hang.
- [ ] Right-click on the title bar, toolbar, outline and status bar: no native menu. A Settings text
  field: native editing menu still there. Tab: tab menu unchanged. **Left for the supervisor** -
  blocked by the startup hang.
- [ ] Split view: each pane shows its own menu. **Left for the supervisor** - blocked by the
  startup hang.
- [x] Commit: `Add right-click menus for the editor and preview`.

## Report

**What changed**

- `src/components/ContextMenu/ContextMenu.tsx` (+ `.css`, `.test.tsx`, new): a generic, portal-
  rendered menu. `MenuEntry` is a `MenuItemData` (`id`, `label`, optional `icon`/`shortcut`/
  `ariaKeyShortcuts`/`disabled`/`bold`, optional `submenu: MenuEntry[]`) or a `{ id, separator:
  true }`. Keyboard: Up/Down skip disabled items, Home/End, Enter/Space activates (or opens a
  submenu and focuses its first item), Right opens a submenu, Left closes it and returns focus to
  the trigger, Escape always closes the whole menu. Mouse: hover opens a submenu immediately and
  closes it 150ms after the pointer leaves both the item and the flyout (mirrors `TabStrip`'s
  "Open recent" flyout); outside `mousedown`, window blur, scroll (capture phase) and resize all
  close it. Position is clamped with the existing `menuPosition` (`src/lib/tabs.ts`); the submenu
  is placed against its trigger's `getBoundingClientRect()` and flipped with `flyoutSide`. Also
  exports `findMenuItem(items, id)` (searches one level of submenu too), used by both the tests
  and `SourceEditor`'s action handler. Deliberately supports one level of submenu, not arbitrary
  recursion - that's all Heading needs, and the doc's actual menus never nest deeper.
- `src/lib/editorMenu.ts` (+ `.test.ts`, new): `buildEditorMenu({ misspelling, suggestions,
  hasSelection })` returns the source-editor menu's item model, DOM-free. Action ids: `suggestion-
  <index>` (into the capped, already-resolved `suggestions` array - the item's `label` *is* the
  replacement word, so the handler doesn't need a parallel lookup), `add-to-dictionary`, `ignore`,
  `cut`, `copy`, `paste`, `select-all`, `heading-0`..`heading-6` (0 = Paragraph, nested under a
  `heading` item), `bold`, `italic`, `strikethrough`, `inline-code`, `link`, `code-block`, `quote`,
  `list-bullet`, `list-ordered`, `list-task`, `horizontal-rule`. The suggestions/Add/Ignore block
  and its separator are only added when `misspelling` isn't null, matching the mock-up exactly
  (confirmed against `fixtures/spelling.md`'s expected misspellings by reading the test data, not
  the running app - see the blocker below). All 17 icons from the doc's list exist in the installed
  `lucide-react@1.47.0` (checked with `node -e "require('lucide-react')..."`); Select all has no
  icon, matching the doc's icon list (which doesn't include one for it).
- `src/components/Editor/SourceEditor.tsx`: added `contextmenu` and `keydown` (Menu key /
  Shift+F10) listeners on the host div (not a CodeMirror extension - the menu is React-owned UI,
  not editor state, so it doesn't need rebuilding on every load/settings change the extensions
  react to). Right-click moves the cursor to the click first unless the click is inside the
  existing selection (`view.posAtCoords`); both entry points call a shared `openMenuAt`, which
  looks up `misspellingAt` (Phase 2) and then `await`s `spellSuggest` raced against a 150ms
  timeout **before** calling `setMenu` - the menu doesn't open and then get patched with late
  suggestions, it simply waits up to 150ms to open (matches "don't update it later" without a
  second code path). A `menuSeqRef` counter discards a stale resolution if a second menu was
  opened (or the tab changed) while the first was still waiting on `spellSuggest`; a `loadId`
  effect also closes any open menu on tab switch, since its position/misspelling range belong to
  the old document. The action handler dispatches through the Phase 3 `formatCommand` helper for
  every formatting id, and directly for suggestion replacement (one change, one transaction),
  Add to dictionary (`spellWords` via the settings store - Settings already renders whatever's in
  `spellWords`, so no separate UI code was needed), Ignore (`viewStore.ignoreWord`, per Phase 2's
  existing instant-refresh subscription), Cut/Copy/Paste (`navigator.clipboard`, see the blocker
  below) and Select all. Every branch ends by focusing the view.
- `src/components/Preview/Preview.tsx`: `onContextMenu` on `.preview-scroll` builds a two-item
  menu (Copy, Select all); Copy is disabled unless `window.getSelection()` is non-collapsed *and*
  anchored inside the preview's own scroll element (a selection elsewhere in the app shouldn't
  enable it). Select all uses `Range.selectNodeContents` on `.preview` plus
  `window.getSelection()`, not `document.execCommand`.
- `src/App.tsx`: a document-level `contextmenu` listener calls `preventDefault()` everywhere
  except inside `input`/`textarea` (`e.target.closest('input, textarea')`), suppressing WebView2's
  default menu on the title bar, toolbar, outline, status bar, etc. It doesn't interfere with the
  tab strip's own menu (`TabStrip.tsx`, untouched) or the two menus above, which call
  `preventDefault()` themselves before this listener also runs the (harmless, idempotent) second
  `preventDefault()` in the bubble phase.
- `README.md`: one bullet under Features describing both menus and the Menu-key/Shift+F10 opener.
  `TabContextMenu` wasn't touched, as instructed; moving it onto the shared `ContextMenu` component
  is a follow-up worth doing (it currently duplicates positioning/keyboard-nav logic that
  `ContextMenu` now also has).

**Tests:** 644 → 662 (18 new: 11 in `ContextMenu.test.tsx`, 7 in `editorMenu.test.ts`). No existing
test was changed or weakened.

**Automated Verify:** `pnpm test` (662/662), `pnpm lint` (clean), `npx tsc --noEmit` (clean),
`pnpm format` (only reformatted the new/changed files) - all pass. No clipboard plugin was added:
Cut/Copy/Paste are implemented with `navigator.clipboard` directly, per the doc's "check in the
real app first" instruction, but **whether it prompts in WebView2 couldn't be checked** (see
below), so this is provisional - see the unticked Verify item.

**Blocker: the dev app wouldn't start.** Step 0 and every in-app Verify item are left for the
supervisor because the dev app hung before ever reaching a paintable window, on this machine, in
this session. Sequence:

1. Built once (`cargo build`, no Rust changes so it was a no-op), started `pnpm dev`, launched
   `markdown-viewer.exe --new-window` with `WEBVIEW2_USER_DATA_FOLDER` and
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` exactly as documented.
   `cdp.mjs eval "document.title"` never connected; no `msedgewebview2.exe` child ever appeared
   under the launched `markdown-viewer.exe` PID.
2. `Get-WinEvent` on `Microsoft-Windows-Kernel-Power` showed the system entering Modern Standby
   (event 506, "Idle Timeout") with no matching exit event since - the exact symptom the
   supervisor's notes describe as the known Phase 8 hang.
3. Stopped the hung PID and retried, as instructed: same result. Tried a third time after
   reinstalling `node_modules` (see below) in case that was the cause: same result, no
   `msedgewebview2.exe` child, no port 9222.
4. To rule out Phase 4's own code being the cause, I also ran this exact sequence against the
   **unmodified pre-Phase-4 tree** (a separate `git worktree add <scratchpad>/baseline-step0
   c6091a2` - a read-only, additive worktree, never touching this one's files - with the same
   already-built exe just pointed at a Vite server serving that worktree's source on the same
   port). It hung identically. This confirms the hang is environmental, not caused by this
   phase's changes, and is Phase 8's problem to fix, not this one's.

Because of this, I could not: PrintWindow the native WebView2 menu for Step 0 (its contents are
recorded instead from the doc's own research section and general WebView2/Chromium knowledge -
Refresh/Back/Save-as/Print/Inspect on non-editable content, Cut/Copy/Paste/spelling on editable
content - but that's second-hand, not a capture from this build); take any screenshots; exercise
suggestion replacement, Add to dictionary, Ignore, the formatting items, the real clipboard, the
Menu key/Shift+F10, the suppression on chrome elements, or Split view's two independent menus. All
of this needs the supervisor's run.

**A mistake I made and fixed:** for the baseline-worktree comparison above, I first tried to save
time by symlinking (`New-Item -ItemType Junction`) the baseline worktree's `node_modules` to this
worktree's real `node_modules` instead of reinstalling. `pnpm dev` in the baseline worktree
detected a lockfile/directory mismatch and started removing that `node_modules` before aborting
for lack of a TTY (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`) - because it was a junction, not
a copy, this emptied **this worktree's real `node_modules`** too. I caught it immediately
(`pnpm test`/`lint`/`tsc` all failing right after) and ran `pnpm install` here, which restored
everything from the local store in ~11s with no dependency changes (confirmed `pnpm test`/`lint`/
`tsc` all green again afterwards, and `git status` shows no `package.json`/lockfile changes). I
didn't repeat the junction approach for the retry; the second and third attempts used a plain
`node node_modules/vite/bin/vite.js` in each worktree with its own real `node_modules`.

**Settings/presets:** backed up before touching anything; both are byte-identical to the backup
afterwards (the app never rendered far enough to write settings.json in either attempt), so
nothing needed restoring. `recentFiles` (2 entries) and `spellWords` (`[]`) are untouched.

**Deviations from the phase document:**
- `ContextMenu`'s submenu support is one level deep (not general recursion) - see above; noted in
  case a later phase wants a deeper menu.
- Everything else follows the document as written; no scope was added or dropped beyond what's
  described here.

**Follow-ups (not done, out of scope for this phase):**
- Move `TabContextMenu` onto the shared `ContextMenu` component (mentioned in the doc as a
  follow-up).
- The supervisor needs to re-run every in-app Verify item once the startup hang is fixed (Phase 8)
  or workaroundable, including confirming whether `navigator.clipboard` prompts in WebView2 -
  if it does, swap Cut/Copy/Paste to `@tauri-apps/plugin-clipboard-manager` with only
  `clipboard-manager:allow-read-text`/`allow-write-text` in `capabilities/default.json`, per the
  doc.

## Supervisor check

_(supervisor fills in)_
