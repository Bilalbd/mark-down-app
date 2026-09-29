# Phase 10: Settings in five clear pages

Bilal's request (2026-09-28): arrange Settings "into a more presentable and structured way". His
choice: **keep the side panel** (the document stays visible while you change colours), with **five
pages**: General, Editor, Appearance, Shortcuts and About. Each page is made of **titled cards**,
and each setting has a short hint.

## Pages and cards (Bilal's layout; supervisor filled in the details)

**General**
- *Window*: Theme; Open files in.
- *Layout*: Show outline; Show status bar; Split layout; Highlight the cursor's block in Split view
  (from Phase 9); Preview zoom.
- *Documents*: Block remote images; Self-contained HTML export.

**Editor**
- *Editor*: Font size; Line numbers.
- *Spelling*: Check spelling; Languages (the list and note from Phase 2/2b, unchanged); Personal
  dictionary.

**Appearance**: today's Presets, Appearance and Custom CSS tabs become one page, with a small
segmented control at the top (**Presets · Fonts & colours · Custom CSS**, the same style as the
existing light/dark segment) that switches between the three. Their contents don't change.

**Shortcuts**: the full shortcut table, grouped as in the README (Files, Tabs, Views, Editing
(Source view)). Keep it as data, so the table and the tests stay in one place.

**About**
- The app icon and name, **Version 1.0.0** (read from Tauri, as today), and "Released under CC0 1.0".
- A **Guide** button (same action as F1), labelled "Open the guide".
- **Settings folder**: the path, with a button "Show in File Explorer" that reveals
  `%APPDATA%\com.bilal.markdown-viewer\` (use the existing reveal wrapper in `src/lib/tauri.ts`, and
  get the folder from `@tauri-apps/api/path`; add no new permission, and stop and report if one
  would be needed).

## Design rules

- Tabs across the top as today (five of them). They must fit on one line at the panel's minimum
  width, or wrap tidily; check at the narrowest window. Remember the last page while the app is open
  (not saved). Keyboard: tabs keep `role="tab"`, `aria-selected`, and arrow-key movement if the
  current tabs have it (read `SettingsPanel.tsx`).
- A **card** is a titled group with a subtle border and background from `--chrome-*` tokens, with
  consistent row spacing. Label on the left with its hint underneath in muted text, control on the
  right. Use the same `Row`/`Section` controls from `controls.tsx` where they fit; add a `Card` if
  needed. Every hint is one short sentence, in British spelling and sentence case.
- Both themes, and no raw hex values (tokens only; new tokens go in `app-theme.css` with light and
  dark values).
- Don't change what any setting does. This is layout and wording only (plus moving files).

## Files

`src/components/Settings/*`: split `GeneralTab.tsx` into page components, e.g. `GeneralPage.tsx`,
`EditorPage.tsx`, `AppearancePage.tsx` (wrapping the existing `PresetsTab`, `AppearanceTab`,
`CustomCssTab`), `ShortcutsPage.tsx` and `AboutPage.tsx`; plus `SettingsPanel.tsx`,
`SettingsPanel.css` and `controls.tsx`. Also `src-tauri/resources/guide/Guide.md` (every place it
says "Settings → General → …" must match the new pages; update the Settings reference to follow the
pages and cards), `README.md` (the same).

## Tests

Existing tests in `GeneralTab.test.tsx` and `SettingsPanel.test.tsx` **move with their code**; every
existing assertion must still exist (adapted to the new component or page), and none is dropped. List
each moved test in the Report. New tests: switching pages, remembering the page, the Appearance
segment switching sub-views, the About page's version line and Guide button, and the shortcut table
rows.

## Verify

- [x] `pnpm test` (the count before and after; it must not go down), `pnpm lint`, `npx tsc --noEmit`,
  `pnpm format`.
- [x] Dev app: screenshots of **every page** in **light and dark** (open each and describe it), plus
  General at the narrowest window width. Real clicks through the tabs and the Appearance segment.
  "Show in File Explorer" opens Explorer on the settings folder (a window screenshot, or confirm the
  Explorer window's title with PowerShell). "Open the guide" opens the guide.
- [x] Every setting still works from its new place (flip a few with real clicks; restore the keys
  afterwards).
- [x] Commit: `Arrange Settings into five pages`.

## Report

**What changed**
- `GeneralTab.tsx` is gone. Its contents are split into `GeneralPage.tsx` (cards *Window*, *Layout*,
  *Documents*), `EditorPage.tsx` (*Editor*, *Spelling*, with all the spelling logic and the language fetch),
  `ShortcutsPage.tsx` (one card per group, data in `shortcutGroups.ts`) and `AboutPage.tsx`.
  `AppearancePage.tsx` wraps the unchanged `PresetsTab`, `AppearanceTab` and `CustomCssTab` behind a segmented
  control (**Presets · Fonts & colours · Custom CSS**, the existing `.settings__segment` style, `aria-pressed`).
- `SettingsPanel.tsx`: five tabs (General, Editor, Appearance, Shortcuts, About). The page and the Appearance view
  are `useState` in the panel, which stays mounted while closed, so both are remembered until the app closes and
  never saved. The body is keyed by page so each page opens scrolled to the top, and it is a `role="tabpanel"`
  labelled by its tab. The old tabs had no arrow-key movement, so none was added.
- Cards: `Section` in `controls.tsx` is now the card (no new component). `SettingsPanel.css` gives it a
  `--chrome-bg` background, `--chrome-border` border, 8px radius, its title inside it, and hairline separators
  between rows. No new tokens and no hex values; both themes use the existing tokens. Every row on General and
  Editor has a hint; the existing hints and the Split highlight hint are unchanged.
- About page: the app mark (the title bar's mask icon, in `--accent`), **Markdown**, `Version 1.0.0` (from Tauri, as
  before, in `.settings__version`), "Released under CC0 1.0", a **Guide** card with **Open the guide** (calls
  `openGuide()`, the same as F1) and a **Settings folder** card with the path and **Show in File Explorer**.
- `src/lib/tauri.ts`: new `settingsFolder()` (`appDataDir()` from `@tauri-apps/api/path`; `null` outside Tauri).
  **`appDataDir()`**, not `appConfigDir()`: the store plugin resolves `settings.json` against the app data
  directory (on Windows both are the same Roaming folder). In the running app it returned
  `C:\Users\bilal\AppData\Roaming\com.bilal.markdown-viewer`. The reveal uses the existing `revealInExplorer`.
  No permission was added: `core:default` already covers the path lookup and `opener:default` the reveal.
- One string changed in `PresetsTab.tsx`: the empty-custom-presets note said "edit any setting in Appearance"; it
  now says "Fonts & colours" (the old name no longer exists as a page).
- `Guide.md`: every "Settings → General …" reference follows the new pages (Window, Layout, Documents; spelling and
  the personal dictionary now say Settings → Editor → Spelling; presets, colours and custom CSS say Settings →
  Appearance → …). The Settings reference is rewritten per page and card (General: Window, Layout, Documents;
  Editor: Editor, Spelling; then Appearance, Shortcuts and About), and Troubleshooting mentions Show in File
  Explorer. `README.md`: the same references, a sentence about the five pages, and "also in Settings → Shortcuts".

**Explorer note.** `revealItemInDir` on a folder opens its *parent* with the folder selected: the Explorer window's
title was "Roaming", with `com.bilal.markdown-viewer` selected (confirmed with `Shell.Application`:
`SelectedItems` = the settings folder). It does not open inside the folder. Opening inside it needs either
`opener:allow-open-path` with a scope (a new permission, so I stopped there) or revealing a file in it
(`settings.json`, which doesn't exist until a first save). Bilal can choose.

**Tests: 707 before, 728 after** (+21; `pnpm test`: 47 files). `pnpm lint`, `npx tsc --noEmit` and `pnpm format`
are clean. No Rust changed.

Moved tests (all kept, same assertions; `GeneralTab.test.tsx` became `EditorPage.test.tsx` by `git mv`):
- To `AboutPage.test.tsx`: "shows the app version once it loads".
- To `GeneralPage.test.tsx`: "has a Split cursor highlight toggle, off by default, that turns the setting on".
- To `ShortcutsPage.test.tsx`: "lists F1 for the guide in the shortcuts table".
- Stayed in `EditorPage.test.tsx` (the component is now `EditorPage`): "shows a hint when Windows has no spelling
  dictionaries", "shows "No words added yet" for an empty personal dictionary", "lists one checkbox per language
  (not per region)", "ticks the automatic language when spellLanguages is empty", "ticks exactly the saved
  languages once the user has chosen explicitly", "lists ticked languages first, each group then sorted by
  label", "keeps the checklist order stable when a checkbox is ticked", "disables the language checklist while
  spell check is off", "writes the explicit list on the first tick, starting from the automatic set", "disables
  the sole ticked language so it cannot be unticked, and shows the hint", "does not disable either checkbox once
  two languages are ticked", "removes a word from the personal dictionary", "toggles the Check spelling
  setting", "unticks a language saved in the old regional tag format".
- `SettingsPanel.test.tsx`: "closes Settings and Dialog separately with two Escapes" is unchanged; only its
  `vi.mock` list moved from the old tabs/`GeneralTab` to the five pages.

New tests: `SettingsPanel.test.tsx` (five tabs in order, opens on General; switching pages sets `aria-selected`;
remembers the page after close and reopen; remembers the Appearance view across pages), `AppearancePage.test.tsx`
(segment labels and initial state; switching the three views), `AboutPage.test.tsx` (name, version and licence;
no version line when unknown; Open the guide calls `openGuide`; path shown and revealed; button disabled without a
folder; error message when the reveal fails), `ShortcutsPage.test.tsx` (one card per group in README order; a row
per shortcut in the data; no empty or duplicate entries), `GeneralPage.test.tsx` (cards and rows in order; every
row has a hint; Show outline flips from its new place), `EditorPage.test.tsx` (cards and rows in order; Line
numbers flips), `tauri.test.ts` (`settingsFolder` is `null` outside Tauri).

**Dev app checks** (built with `cargo build`, Vite via `pnpm dev`, exe with `--new-window`, own
`WEBVIEW2_USER_DATA_FOLDER`; real CDP mouse events through the tabs and the segment). Screenshots in my scratchpad
(`...\scratchpad\p10\`), each opened and read; pairs differ by hash (general-dark `A0B05F…` vs general-light
`50365C…`; about-dark `799CD9…` vs about-light `0917C7…`; shortcuts-dark2 `A043F8…` vs shortcuts-light `F61F05…`).
- General, dark and light: three cards (Window: Theme, Open files in; Layout: five rows; Documents: two rows),
  each row with label, muted hint under it, control at the right; hairlines between rows; card lighter than the
  panel in dark, slightly darker in light.
- Editor, dark and light: Editor card (font size 14 px, Line numbers ticked); Spelling card with Check spelling,
  the Arabic and English checklist, the "To stop checking..." note and the four personal-dictionary words with
  their remove buttons.
- Appearance, both themes, all three views: the segmented control spans the panel; Presets shows Built-in (Boulayla
  selected) and Custom cards; Fonts & colours shows the note and the Typography, Heading sizes and Colours cards;
  Custom CSS shows the note and the textarea filling the page.
- Shortcuts, both themes: four cards (Files, Tabs, Views, Editing) with kbd chips; I widened the key column
  (58%) because the narrower card made "Ctrl+Tab / Ctrl+Shift+Tab" break mid-chip.
- About, both themes: mark in the accent colour, Markdown, Version 1.0.0, Released under CC0 1.0, the Guide card and
  the Settings folder card with the path.
- Narrowest window (480 px, emulated with `Emulation.setDeviceMetricsOverride`): the five tabs fit on one line
  (right edge 315 px in a 380 px panel, close button visible) and General reads correctly with the outline hidden.
  With the outline showing at 480 px the fixed 380 px panel is pushed past the window edge; that is how it was
  before this phase (see Follow-ups).
- Show in File Explorer opened an Explorer window titled "Roaming" with the settings folder selected (see the note
  above); I closed only that window, by `WM_CLOSE` to its handle. Open the guide opened `Guide.md` as a second tab.
- Real clicks flipped Show outline, Show status bar, the Split highlight, Block remote images, Self-contained HTML
  export, Line numbers and Check spelling from their new pages: each store value changed and the outline and
  status bar vanished from the DOM; a second round of clicks put them back. Theme, Open files in, Split layout,
  Preview zoom and Font size were only checked visually (native select and number inputs).

**Restored.** Stopped only my own processes (the exe, `vite` and its `cmd` launcher, confirmed by command line).
`presets.json` and `.window-state.json` are byte-identical to the backups. `settings.json` matches the backup
by value for every key: my check had put `gfm.md` at the top of `recentFiles`, which I set back. Final values on
disk: `recentFiles` = `C:\Agents Projects\allocate-v3\docs\audits\2026-09-27-remediation-plan.md`, then
`...\2026-09-27-codebase-audit.md`; `splitCursorMirror` = `false`; `activePresetId` = `builtin-boulayla` (in
`presets.json`; `settings.json` has no such key). The file's key order differs from the backup because the store
rewrites it.

**Follow-ups (not done).** (1) At the minimum window width (480 px) with the outline open, the 380 px Settings panel
runs off the right edge, hiding its close button (it was already so). (2) Open the folder itself from About (see the
Explorer note). (3) The Guide's shortcuts table is one flat table while the app now groups them; left as is.

## Supervisor check

_(supervisor fills in)_
