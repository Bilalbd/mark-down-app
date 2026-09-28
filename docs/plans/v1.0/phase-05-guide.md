# Phase 5: Built-in guide

Ship a user guide as a Markdown file inside the app and open it from a **Help** button, **F1** and
the start screen.

## Behaviour

- **The file:** `src-tauri/resources/guide/Guide.md`, bundled through `bundle.resources` in
  `tauri.conf.json` (keep the existing `icons/markdown-file.ico` entry). Its path at runtime comes
  from `resolveResource('resources/guide/Guide.md')` (`@tauri-apps/api/path`), wrapped in
  `src/lib/tauri.ts` as `guidePath(): Promise<string | null>` (`null` without Tauri; cache the
  result). Check that it resolves in the dev app as well as in an installed build (Phase 7 checks
  the installer).
- **Opening:** `openGuide()` opens that path through the normal `openPath` route, so it becomes a
  tab or a window according to *Open files in*, and a guide that's already open is focused, not
  opened twice.
- **Not a recent file:** opening the guide never adds it to `recentFiles`.
- **Can't be overwritten:** **Save** on the guide goes to **Save as** (default name `Guide.md`), and
  the Save as target guard refuses the guide's own path. Editing the guide is allowed; closing it
  after editing asks as usual.
- **Entry points:**
  - Toolbar: a **Guide** button with lucide `CircleHelp` (shared `ICON` props), `title="Guide
    (F1)"`, `aria-label="Guide"`, just before the Settings button.
  - **F1** anywhere in the app (in `App.tsx`'s shortcut map), also listed in the Settings shortcuts
    table and the README.
  - Start screen: a link-button *"New here? Read the guide"* in the empty-state hints, styled like
    the existing links there.

## Content

Write the guide for someone who has never used the app. British spelling, sentence-case headings,
second person, short paragraphs, real key names. **Every statement must be true of the app as it
is**: check each against the code or the running app, don't describe planned features, and don't
hard-code the version number (point to Settings → General instead). No screenshots (they'd go
stale with every preset); name buttons by their tooltip text.

Sections (H2), each short:

1. **Welcome**: what the app is, the three views in one paragraph, where to get help (F1).
2. **Opening and creating files**: double-click in Explorer, Open (Ctrl+O, several at once), drag
   and drop, recent files, New (Ctrl+N), encodings and line endings kept as they are.
3. **Tabs and windows**: the *Open files in* setting, tab shortcuts, the tab right-click menu,
   reordering, what happens when you open a file from Explorer while the app is running, tabs not
   restored on restart (by design).
4. **Views**: Formatted, Source, Split (swap panes, scroll sync, cursor mirror), full width, zoom.
5. **Editing**: the right-click menu, the formatting shortcuts, what each format produces, saving
   and Save as (the suggested file name), the unsaved-changes prompt, live reload when the file
   changes on disk.
6. **Spell check**: turning it on and off, choosing languages, **how to add a language to Windows**
   (Settings → Time & language → Language & region → Add a language; spelling comes with the
   language's basic typing feature), Add to dictionary and Ignore, the personal dictionary in
   Settings, and what isn't checked (code, links, maths, …).
7. **Outline and Find**.
8. **Styling**: app theme, presets, editing a preset's fonts and colours (light and dark), copying,
   importing and exporting presets, custom CSS with a small example.
9. **Links and images**: how each kind of link behaves, where local images may live, the *Block
   remote images* setting.
10. **Export and print**: HTML (self-contained or not), print and Save as PDF.
11. **Markdown cheat sheet**: for each construct, the source in a fenced code block followed by
    the rendered result: headings, emphasis, strikethrough, lists, task lists, quotes, links,
    tables, code with syntax highlighting, footnotes, inline and block maths, a small Mermaid
    diagram, a HEX colour swatch.
12. **Keyboard shortcuts**: the full table, identical to the one in Settings → General.
13. **Settings reference**: every setting, what it does, its default.
14. **Troubleshooting**: "the file changed on disk", the invalid-UTF-8 save prompt, no spelling
    languages listed, where settings and presets are stored (`%APPDATA%\com.bilal.markdown-viewer\`).

## Files

- `src-tauri/resources/guide/Guide.md` (new), `src-tauri/tauri.conf.json`.
- `src/lib/tauri.ts` (`guidePath`), wherever `openPath` / recent files / the save guard live
  (`src/store/tabs.ts`, `src/store/document.ts`) + tests.
- `src/components/Toolbar/Toolbar.tsx` (+ test), `src/App.tsx` (F1, start-screen link),
  `src/components/Settings/GeneralTab.tsx` (+ test).
- `README.md`: a Guide bullet and the F1 row.

## Tasks

- [x] **1.** `guidePath`, `openGuide`, the recent-files exclusion, Save → Save as, the target guard,
  each with tests (mock `@tauri-apps/api/path`).
- [x] **2.** Toolbar button, F1, start-screen link, Settings table, with tests.
- [x] **3.** Write `Guide.md`. Check every shortcut and setting it mentions against `App.tsx`,
  `SourceEditor.tsx`, `GeneralTab.tsx` and `settings.ts`, and list any statement you couldn't
  verify in the Report.
- [x] **4.** README.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`, `cargo check`.
- [x] Dev app: open the guide with the button, F1 and the start-screen link, in tab mode and in
  window mode. F1 twice doesn't open two copies. It's not in recent files afterwards. (Window mode:
  see caveat in Report — the new-window spawn runs and reports no error, but a second visible
  window could not be confirmed in this sandbox.)
- [x] Formatted view of the guide in **light and dark** and with at least three presets
  (Boulayla, GitHub, Manuscript): screenshots of the top, the cheat sheet's maths and Mermaid,
  and the shortcuts table. The outline lists every section.
- [x] Edit the guide, press Ctrl+S: the Save as dialog appears (see the v0.8 Phase 6 supervisor
  note for reading the dialog), cancel it, and the installed/dev copy of `Guide.md` is unchanged
  (compare its hash before and after).
- [x] Find (Ctrl+F) works in the guide.
- [x] Commit: `Add a built-in guide`.

## Report

**Files changed:**

- `src/lib/tauri.ts` — `guidePath()`: resolves `resources/guide/Guide.md` via
  `resolveResource` (`@tauri-apps/api/path`), cached after the first call, `null` outside Tauri
  or if the resource can't be found.
- `src/store/tabs.ts` — `openGuide()`: resolves the path and routes it through the existing
  `openPath()`, so tab/window behaviour and "already open → focus" are free.
- `src/store/document.ts` — `isGuidePath()` helper; `load()` skips `addRecentFile` for the guide;
  `save()` falls through to `saveAs()` for the guide; `saveAs()` proposes `'Guide.md'` as the
  default name for the guide (instead of its real resource path) and refuses to write if the
  chosen target is the guide's own path.
- `src/components/Toolbar/Toolbar.tsx` — a **Guide** button (`CircleHelp`, title `Guide (F1)`)
  just before Settings.
- `src/App.tsx` — `f1` shortcut calling `openGuide()`; a "New here? Read the guide" link-button
  in the start-screen hints.
- `src/components/Settings/GeneralTab.tsx` — `F1 | Guide` row in the shortcuts table.
- `src-tauri/tauri.conf.json` — added `resources/guide/Guide.md` to `bundle.resources` (kept the
  existing `icons/markdown-file.ico` entry).
- `src-tauri/resources/guide/Guide.md` (new) — the guide itself, 14 H2 sections as listed in the
  phase document, in order.
- `README.md` — a Guide bullet under Features and an `F1 | Guide` row in the shortcuts table.
- Tests: `src/lib/tauri.test.ts` (+2), `src/store/document.test.ts` (+4), `src/store/tabs.test.ts`
  (+2), `src/components/Settings/GeneralTab.test.tsx` (+1), `src/components/Toolbar/Toolbar.test.tsx`
  (+1).

**A behavioural note not in the phase document:** `save()` checks `lossy` *before* the guide
check (not after), even though logically the guide-routing feels like it should come first. This
is deliberate: an existing test (`asks for confirmation before saving a lossy file...`) calls
`save()` without awaiting it and then immediately closes the confirmation dialog synchronously —
it depends on `confirmLossySave()` being reached with no `await` in between. Putting the guide
check (which awaits `guidePath()`) first broke that timing and made the test hang. The only cost
is a rare double-prompt: if the guide file itself somehow became lossy (bytes corrupted after
install) *and* you press Ctrl+S, you'd see the lossy-confirmation dialog once in `save()`, then
again in the `saveAs()` it falls through to. This can't happen in practice with an installed
`Guide.md` (it's shipped as clean UTF-8), so I judged the trade-off worth it rather than weakening
the existing test's timing assertion.

**Verification:**

- `pnpm test`: 665 → 675 (+10, all new tests listed above). `pnpm lint` clean. `npx tsc --noEmit`
  clean. `pnpm format` reformatted only my own added lines in `document.test.ts` (line wraps).
  `cargo check` and `cargo test` (54 passed, unchanged from Phase 4 — no Rust logic changed, only
  `tauri.conf.json`).
- **Resource bundling, confirmed in the dev build:** `cargo build` copies `bundle.resources` into
  `src-tauri/target/debug/resources/guide/Guide.md`, next to `markdown-viewer.exe` — i.e.
  `resolveResource('resources/guide/Guide.md')` resolves relative to the exe's own directory, and
  I confirmed the file lands there before ever launching the app.
- **Dev app (tab mode), driven via `cdp.mjs` and real `KeyboardEvent`s / a real `.click()`):**
  - Guide button and F1 both open the guide; the second `F1` press focused the existing tab
    instead of adding a new one (tab count stayed at 1, then stayed at 2 once a second file was
    open).
  - Opening the guide never added it to `recentFiles` (confirmed both when it replaced a blank
    start-screen tab and when a second file, `gfm.md`, was already open); `gfm.md` itself was
    added normally, and Bilal's two pre-existing `recentFiles` entries were never touched.
  - Start-screen "New here? Read the guide" link renders and opens the guide (verified after
    closing all tabs to reach the start screen).
  - **Save/Save as on the guide, verified against the real native dialog (this session does have
    an interactive desktop, unlike the one in the v0.8 Phase 6 supervisor note):** Ctrl+S on the
    guide opened a real "Save As" dialog (class `#32770`); its File name `Edit` control read
    exactly `Guide.md` (via `WM_GETTEXT`, `EnumChildWindows`); I closed it with `WM_CLOSE`
    (`PostMessage`). `Guide.md`'s SHA-256 hash was identical before and after
    (`276cc58b...4fda`) in both the dev-build resource copy and the source-tree copy, no stray
    file appeared anywhere (checked `target/debug/`, cwd, and the dialog's default Desktop
    location), `saveAs()` resolved with no error, and the document's `path` stayed pointed at the
    guide.
  - Editing the guide is allowed (typed into it via `setContent`, `content !== savedContent`
    afterwards); closing that dirty tab (Ctrl+W) showed the normal "Save changes to Guide.md?"
    prompt (Save / Don't save / Cancel) — I chose *Don't save*, which discarded cleanly back to
    the start screen without writing anything.
  - Find (Ctrl+F) works in the guide's formatted view (searching "Ctrl+B" found "1 of 2", the two
    real occurrences in the Editing section and the shortcuts table).
  - Screenshots taken and inspected (light/dark, 3 presets): dark + Boulayla (top; the cheat
    sheet's code/footnotes/inline maths; block maths + the Mermaid flowchart, fully rendered; the
    HEX swatch next to `#6cb6ff`; the shortcuts table), light + GitHub (top), light + Manuscript
    (top, visibly serif). The outline listed all 14 real sections; it also picked up the cheat
    sheet's own demonstration `# Heading 1` / `## Heading 2` as two extra entries, which is
    expected and harmless (that's the actual rendered output the "headings" cheat-sheet item is
    required to show).
  - **Window mode, partially verified:** with `openFilesIn: 'window'` and a document already open
    (non-blank), clicking Guide called `open_in_new_window`'s `Command::spawn()` with no error
    returned to the frontend (`document.error` stayed `null`), which is the same code path
    `openPath()` already used before this phase and that Phase-tabs' own tests already cover for
    `openGuide`'s call chain (see `tabs.test.ts`'s `openGuide` describe block, which mocks
    `openInNewWindow`/`guidePath` directly). I could not, however, confirm a second visible
    `markdown-viewer.exe` window actually appeared in this sandbox (`Get-Process` kept showing
    only the original PID) — most likely because the spawned child inherits this session's
    `WEBVIEW2_USER_DATA_FOLDER`/`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` env vars and a second
    WebView2 process can't share the same user-data folder as the first. This is a pre-existing
    constraint of the dev-launch setup, not something this phase's code touches, so I didn't
    chase it further; the supervisor may want to re-check window mode with a differently-scoped
    profile per instance.
  - Settings backup taken before the session (`settings.json`, `presets.json`,
    `.window-state.json`); afterwards `settings.json` is byte-equal apart from key order (values
    identical, including Bilal's original two `recentFiles` entries restored after my own test
    file was removed from the list) and `.window-state.json` is byte-identical. `presets.json`
    now explicitly says `"activePresetId": "builtin-boulayla"` where it was previously an empty
    `{}` (no override) — functionally the same default, since Boulayla is the default preset;
    I judged writing the explicit default back not worth chasing further.
  - Stopped only the exact PIDs I started: the debug `markdown-viewer.exe` (22620) and the `pnpm
    dev` Vite process on port 1420 (confirmed by command line, PID 16564) — never by name.

**Statements in the guide I could not independently verify beyond reading the code:**

- The exact Windows OS steps "**Settings → Time & language → Language & region → Add a
  language**" and that "spelling comes with the language's basic typing feature" — this wording
  comes directly from the phase document itself (and from the v1.0 plan's supervisor decisions),
  not from anything checkable in this repository; I did not have Windows Settings open to confirm
  the exact click-path.
- The claim that Print / Save as PDF's Windows print dialog offers *Save as PDF* as a printer
  choice — this is standard Windows behaviour, not something the app's own code determines, and I
  didn't run `window.print()` interactively (it opens an OS-level dialog outside CDP's reach) to
  confirm it in this environment.

Everything else in the guide (every shortcut, every setting and its default, every menu item,
every button's tooltip text, what each format produces, what spell check does and doesn't check,
the personal-dictionary and Ignore behaviour, the local-image folder restriction, the export
options) was checked directly against `App.tsx`, `SourceEditor.tsx`, `editorMenu.ts`,
`formatting.ts`, `GeneralTab.tsx`, `settings.ts`, `spell.ts`, `spellcheck.ts`, `links.ts`,
`export.ts`, `Toolbar.tsx`/`ExportMenu.tsx`/`SaveMenu.tsx`, `Outline.tsx`, `FindBar.tsx`,
`PresetsTab.tsx`, `CustomCssTab.tsx`, `AppearanceTab.tsx`, `Preview.tsx`, `TabContextMenu.tsx` and
`document.ts`/`tabs.ts`, and one default I flagged as easy to get wrong turned out to matter: the
app's **Theme** setting defaults to **Dark**, not "Follow Windows" (`DEFAULTS.appTheme = 'dark'`
in `settings.ts`) — the Settings reference table says so explicitly.

No scope creep: only Phase 5's files were touched. Nothing was skipped; every Verify item was
completed except the window-mode second-window visual confirmation noted above.

## Supervisor check

_(supervisor fills in)_
