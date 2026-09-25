# Implementation plan: tabs, and an "Open files in" setting

**Audience:** an AI coding agent working in a fresh session with no prior context.
**Repo:** `C:\Claude Projects\mark-down-app` (a Windows Markdown viewer/editor). Read `CLAUDE.md`
first; everything there still applies except the "no tabs" rule this plan replaces.
**Goal:** Markdown files can open as tabs in one window. A setting, **Open files in: New tab /
New window**, decides whether files opened from Explorer (and from inside the app) become tabs or
separate windows.

Work through the phases **in order**, one commit per phase. Each phase has a **Verify** step that
must pass before you commit.

---

## 0. Context

### Decisions made by Bilal (do NOT change or re-discuss)

| Topic | Decision |
|---|---|
| Tab strip | **In the custom title bar**, like Windows 11 Notepad and Terminal. It shows even with one tab, whenever the mode is "New tab". |
| Setting | `openFilesIn: 'tab' \| 'window'`, **default `'tab'`**, labelled "Open files in" in Settings → General. |
| "New window" mode | **Exactly today's app.** Explorer and Open With launch a new window. Ctrl+O, recent files, drag-and-drop and `.md` links replace the current document after the unsaved-changes prompt. |
| How windows are created | **One process per window, as today.** The running app starts a new copy of itself for the file. Rust state (watcher, image folder) stays per process. |
| Still out of scope | Folder browser, autosave, restoring the session (tabs) on relaunch, moving tabs between windows, a tab context menu. Don't add these. |

Decisions this plan makes (tell Bilal about them in the report so he can overrule):
- Closing the last tab shows the start screen (Open / New / Recent) instead of closing the window.
- Each tab keeps its own view mode (Formatted / Source / Split), scroll position and undo history.
  A new app still starts in Formatted.
- A file that is already open in a tab is focused, not opened twice. Paths are compared without
  regard to case, and `/` counts the same as `\`.
- In tab mode, a file opens *into* the active tab (no new tab) when that tab is blank: the start
  screen, or an untitled document that is empty and unchanged.

### How things work today (what changes)

- **No single-instance handling.** Every double-click in Explorer starts a new process and window
  (`commands::get_launch_args` reads `argv`). For tabs, a second launch has to pass its file to
  the running app. This needs **`tauri-plugin-single-instance`**, a new dependency. Give the reason
  in the commit message: "route files opened from Explorer to the running window".
- **`useDocumentStore` holds the one open document.** Every component reads it directly
  (`Preview`, `SourceEditor`, `FindBar`, `ExportMenu`, `App`).
- **`watch.rs` watches one file.** `watch_file` replaces the previous watch. Tabs need several.
- **`assets.rs` `AssetRoot` is one folder per process.** That's fine for tabs: only the active tab
  renders, so switching tabs calls `setAssetRoot(dirname(path))`.
- **`SourceEditor.tsx` caches one `EditorState`** in a module-level `cached` keyed by `loadId`,
  so undo history survives Ctrl+E. It becomes one cached state per tab.
- `viewMode` lives in the settings store (ephemeral), and `topLine` / `pendingScrollLine` live in the
  view store.

### Architecture: swap the active document

Keep `useDocumentStore` as **the active tab's document**, so no component needs to change how it
reads. A new **`useTabsStore`** (`src/store/tabs.ts`) holds a list of tabs. Inactive tabs keep a
**snapshot**: the document store's data fields, plus `viewMode`, `topLine` and the cached
`EditorState`. Switching tabs:

1. Snapshot the live stores into the outgoing tab.
2. `useDocumentStore.setState(incoming.doc)`, `settings.set('viewMode', incoming.viewMode)`, and
   `view.requestScrollToLine(incoming.topLine)`. Close the find bar.
3. `setAssetRoot(dirname(path) or null)`. The watcher already covers every open tab's file.

Make `loadId` a **module-level counter that is unique across tabs**, so restoring a snapshot's
`loadId` never looks like a fresh load to `SourceEditor`, and a real load always does.

We don't key every store by tab id, because that would change every selector in the app. Swapping
keeps the change contained, and all existing code paths (`confirmDiscard`, `save`,
`onFileChanged`) keep working on "the document on screen".

Pure logic goes in `src/lib/tabs.ts` with tests, as `CLAUDE.md` requires.

### Commands

See `CLAUDE.md` §2. Every phase ends with `pnpm test`, `pnpm lint` and `npx tsc --noEmit`. Phases that
touch Rust also need `cargo check` and `cargo test`. Remember the Bash backslash quirk: write
Windows paths in tests with the Write/Edit tools.

---

## Phase 1: Update the project rules

1. `CLAUDE.md` §1: replace "**One file per window.** No tabs, no folder browser or file tree."
   with "**Tabs or windows**, chosen by the *Open files in* setting (default: tabs). No folder
   browser or file tree." Remove "tabs" from the out-of-scope list. In §4, add "closing a tab" to
   the `confirmDiscard()` list. In §3, add `tabs` to the store list: "the open tabs and inactive
   tabs' snapshots; never saved".
2. `README.md`: change the "one file per window" wording if present. The feature text itself comes
   in Phase 7.
3. `docs/plans/review-fixes-plan.md` is historical. Leave it alone.

**Verify:** read the diff. **Commit:** `Allow tabs: update project rules for tabbed documents`.

---

## Phase 2: Watch several files (Rust)

1. `watch.rs`: `WatchState { inner: Mutex<HashMap<PathBuf, FileDebouncer>> }`.
   - `watch_file(path)` **adds** a watch. It does nothing if that path is already watched.
   - `unwatch_file(path: String)` removes that one watch.
   - Events are unchanged (`file-changed` with `path`, `mtime`, `removed`).
2. `tauri.ts`: `unwatchFile(path: string)`.
3. `document.ts`: until tabs exist, keep today's single-file behaviour. When `open`, `saveAs` or
   `newDocument` leaves a path behind, call `unwatchFile(oldPath)`. `newDocument` currently calls
   `unwatchFile()` with no argument, so fix that too.
4. Update `document.test.ts` for the new `unwatchFile` signature. Add a test: opening B after A
   unwatches A.

**Verify:** tests, lint, tsc, cargo check/test. In the dev app, open `fixtures/gfm.md`, edit it
externally (`Add-Content`), and check it live-reloads. Open another file and check that editing the
first one no longer triggers anything. **Commit:** `Let the file watcher track several files`.

---

## Phase 3: Tab helpers (pure logic)

`src/lib/tabs.ts`, plus `tabs.test.ts`. Keep it framework-free.

- `samePath(a, b)`: compares without case and treats `/` and `\` as equal.
- `findTabByPath(tabs, path)`: returns the id, or `null`.
- `isBlankTab(doc)`: true when `!hasDocument`, or when it's untitled, empty and not dirty.
- `nextActiveAfterClose(ids, closingId, activeId)`: the tab to the right, else the tab to the left,
  else `null`. The active tab only changes if the active tab is the one closing.
- `moveTab(ids, fromIndex, toIndex)`: returns a new array.
- `tabLabels(paths)`: basenames. When two tabs share a basename, add the smallest parent-folder
  suffix that tells them apart (`README.md · docs`, `README.md · api`). Untitled tabs get
  `Untitled`, `Untitled 2`, …

**Verify:** unit tests cover every helper, including case and slash mixes and duplicate names at
different depths. **Commit:** `Add pure helpers for tab bookkeeping`.

---

## Phase 4: Tabs store and document swap

1. `src/store/tabs.ts` (zustand, never saved):
   ```ts
   interface TabSnapshot { doc: DocFields; viewMode: ViewMode; topLine: number; editorState: EditorState | null }
   interface Tab { id: string; snapshot: TabSnapshot | null } // null while it's the active tab
   interface TabsState {
     tabs: Tab[]; activeId: string | null;
     /** Opens `path` in a new tab, or focuses it if already open, or loads it into a blank active tab. */
     openInTab: (path: string) => Promise<boolean>;
     newTab: () => Promise<void>;      // blank untitled tab, Source view
     activate: (id: string) => void;
     close: (id: string) => Promise<boolean>; // activates it first if dirty, then confirmDiscard()
     /** Asks about every dirty tab in turn; false if the user cancels any of them. */
     confirmCloseAll: () => Promise<boolean>;
     move: (from: number, to: number) => void;
   }
   ```
   `DocFields` is the data part of `DocumentState` (no functions). Export it from `document.ts`.
2. `document.ts`:
   - `loadId` comes from a module-level `nextLoadId()`, so it's unique across tabs.
   - Add `load(path)`. This is `open` without the `confirmDiscard` step, so `openInTab` can load into a
     fresh tab. `open` = `confirmDiscard` + `load`, so today's callers keep working.
   - `onFileChanged`: leave it as is for the active tab. `App.tsx` sends events for *inactive* tabs
     to `useTabsStore.getState().onInactiveFileChanged(e)`. That function sets a
     `needsReload: true` flag on the snapshot when the tab is clean, or sets `externalChange` when
     it's dirty (compare `mtime` as today). When a `needsReload` tab is activated, call `reload()`.
   - Only unwatch a path when no tab has it any more (`closeTab` and `saveAs` handle this).
   - Save As to a path that's open in *another* tab: if that tab is clean, close it after saving. If
     it's dirty, stop before writing and set `error: 'That file is open in another tab with unsaved
     changes.'`.
3. `SourceEditor.tsx`: replace the module-level `cached` with the active tab's
   `snapshot.editorState`. The tabs store takes `view.state` when a tab is deactivated. The
   editor's unmount path still writes the cache so Ctrl+E keeps undo history. Keep the
   snapshot-ref pattern: the project memory explains why a boolean "first run" ref breaks under
   StrictMode.
4. `Preview.tsx`: when the tab changes (use `loadId` or the active id), render **without** the
   150 ms debounce so switching doesn't flash old content. Edits stay debounced.
5. Startup: `App.tsx` creates the first tab (blank) before the launch file loads, so there is always
   an `activeId` in tab mode.
6. Add `tabs` to `window.__mdv` in `main.tsx`.
7. Tests in `src/store/tabs.test.ts`, mocking `@/lib/tauri` like `document.test.ts` does:
   - Open A, then B: two tabs, B active. Switch back: A's content, `viewMode` and `topLine` come back.
   - Opening A again focuses the existing tab. `C:\x\A.md` vs `c:/x/a.md` counts as the same file.
   - A file opened while the active tab is blank goes into that tab.
   - Closing a dirty inactive tab activates it and asks. Cancel keeps it.
   - `confirmCloseAll` with two dirty tabs asks twice. Cancelling the second returns false.
   - Inactive tab file changes: clean → reloads on activation; dirty → `externalChange: 'modified'`.
   - Closing the last tab leaves the start screen (`hasDocument: false`).
   - A watched path is only unwatched when its last tab closes.

**Verify:** tests, lint, tsc. In the dev app, drive the store with `cdp.mjs`
(`__mdv.tabs.getState().openInTab(...)`) using `fixtures/gfm.md`, `math.md` and `huge.md`. Switch
between them. Check that undo history survives a switch, per-tab view modes, and that images in
`gfm.md` still load after switching away and back (asset root). Time a switch to `huge.md`. It
should feel instant (under ~200 ms); report the number. **Commit:** `Add a tabs store that swaps the
active document`.

---

## Phase 5: Tab strip in the title bar

1. `src/components/Tabs/TabStrip.tsx` + `TabStrip.css`, rendered inside `TitleBar` between the logo
   and the window controls. It replaces the "Markdown – file" text when shown. Show it when
   `openFilesIn === 'tab'` **or** `tabs.length > 1`, so switching to window mode never hides open
   tabs.
2. Each tab: `role="tab"`, `aria-selected`, a label from `tabLabels`, a `title` with the full path,
   a dirty dot (reuse the look of `.titlebar__dirty`), and a close `<button>` with `X` from
   `lucide-react` (shared `ICON` props) and `aria-label="Close <name>"`. Middle-click closes. After
   the tabs comes a `+` button (`Plus`, `aria-label="New tab"`, `title="New tab (Ctrl+T)"`). The
   container has `role="tablist"`. Left and right arrow keys move focus, and Enter activates.
3. Dragging: tabs and buttons are **not** `data-tauri-drag-region`. The empty space after the `+`
   **is**, so the window can still be dragged and double-click-maximised. Check this on purpose.
4. Overflow: tabs shrink to a minimum width (~100px) with ellipsis. Past that, the strip scrolls
   sideways (mouse wheel scrolls it) and the active tab is scrolled into view.
5. Reordering by dragging: use **pointer events**, not HTML5 drag-and-drop. `dragDropEnabled: true`
   (needed for Explorer drops) stops HTML5 drag-and-drop working inside WebView2. If this turns
   into a lot of code, leave it for a follow-up and report it rather than half-building it.
6. Colours: only `--chrome-*` / `--accent` tokens. Add new tokens to `app-theme.css` with light
   and dark values if needed (active tab background, hover). Check both themes and at least two
   presets (the chrome follows the preset through `chromeCss.ts`).
7. `document.title` shows the active tab (unchanged logic, fed by the active document).
8. Shortcuts. Each goes in `App.tsx`, the button `title` and the `GeneralTab.tsx` table:
   | Keys | Action |
   |---|---|
   | Ctrl+T | New tab |
   | Ctrl+W | Close tab |
   | Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab (also Ctrl+PageDown / Ctrl+PageUp) |
   | Ctrl+1 … Ctrl+8, Ctrl+9 | Go to tab N; Ctrl+9 goes to the last tab |
   Check that `useShortcuts` sees Ctrl+Tab while CodeMirror has focus. If it doesn't, handle it
   in capture phase in `lib/shortcuts.ts` and add a test. In window mode, Ctrl+T and Ctrl+W do nothing.

**Verify:** tests, lint, tsc. Screenshots in light and dark, with 1, 3 and ~15 tabs (overflow), two
`README.md` tabs from different folders (label suffix), a dirty tab, and keyboard focus on a tab.
Drag the window by the empty strip area. **Commit:** `Show open documents as tabs in the title bar`.

---

## Phase 6: The setting, and routing opens in the app

1. `settings.ts`: `export type OpenFilesIn = 'tab' | 'window'`. Add `openFilesIn` to `Settings` and
   `DEFAULTS` (`'tab'`). It is saved.
2. `GeneralTab.tsx`: a row "Open files in" with a segmented control (match the "Theme" row):
   `New tab` / `New window`. Hint: "Also applies to files opened from Explorer".
3. Add one function, `openPath(path)`, to `src/store/tabs.ts`, and route every in-app open through
   it: `'tab'` → `openInTab`, `'window'` → `useDocumentStore.getState().open` (today's behaviour).
   Callers:
   - `openWithDialog` (Ctrl+O). In tab mode, allow picking **several** files (`multiple: true`),
     each opening as a tab.
   - Recent files on the start screen.
   - Drag-and-drop in `App.tsx`. In tab mode, open **every** dropped path; in window mode keep
     "first file only".
   - `.md` links in `Preview.tsx` (the `classification.path` branch).
   - Ctrl+N / the toolbar "New": `newTab()` in tab mode, today's `createNew` in window mode.
4. Window close guard in `App.tsx`: use `confirmCloseAll()` instead of the single `isDirty` check.
   In window mode there is one tab, so it behaves exactly as today.

**Verify:** tests for `openPath` routing in both modes (settings store set directly). In the dev
app, try both modes: Ctrl+O, recent files, dropping 3 files from Explorer, a `.md` link from
`fixtures/links.md`, Ctrl+N, and closing the window with two dirty tabs (Cancel on the second keeps
the window open with that tab active). **Commit:** `Add the "Open files in" setting and route opens
through it`.

---

## Phase 7: Opens from Explorer (single instance)

1. `pnpm tauri add single-instance` (or `cargo add tauri-plugin-single-instance` + `pnpm add
   @tauri-apps/plugin-single-instance` if a JS package is needed; it usually isn't). Register it
   **first** in the builder. It must be the first plugin.
2. Skip registering it when `argv` contains `--new-window`. Windows we start ourselves must not
   take over the single-instance lock or forward to the first process.
3. `commands.rs`: pull the path parsing out of `get_launch_args` into a pure
   `launch_path(args: &[String], cwd: &Path) -> Option<String>`. It skips the exe and anything
   starting with `-`, resolves relative paths against `cwd` (the plugin passes the second
   instance's cwd), and normalises as today. Add `#[cfg(test)]` tests.
4. `PendingOpens(Mutex<Vec<String>>)` as managed state. The plugin callback
   `|app, argv, cwd|` pushes `launch_path(...)`, emits `open-requested`, and unminimises, shows
   and focuses the `main` window.
5. Command `take_pending_opens() -> Vec<String>`, which drains the queue. The frontend calls it
   after subscribing and after every `open-requested` event. This covers events that arrive
   before React has subscribed.
6. Command `open_in_new_window(path: String) -> Result<(), String>`: checks that `path` is an
   existing file, then `std::process::Command::new(std::env::current_exe()?)` with
   `.arg("--new-window").arg(path).spawn()`. No shell, and the arguments are passed separately.
   Map errors with `.map_err(|e| e.to_string())`.
7. Add both commands to `generate_handler!` and to `tauri.ts` (`takePendingOpens`,
   `openInNewWindow`). Both must be safe without Tauri. No capability changes are expected; if
   Tauri asks for one, add the narrowest one and say so in the report.
8. Frontend (`App.tsx`, the usual `let unlisten` pattern): on `open-requested`, drain the queue.
   Read `openFilesIn` **fresh from disk** first, because another window's process may have
   changed it. Add a small `refresh(key)` to the settings store that calls `store.reload()` and
   takes the value. Then `'tab'` → `openInTab(path)` for each path; `'window'` →
   `openInNewWindow(path)` for each path. Show failures in the document store's `error`.
9. The launch-argument path at startup stays as it is (`getLaunchArgs` → open in the first tab).

**Verify:** cargo check/test (the `launch_path` tests), tests, lint, tsc. Start the dev app, then
run the debug exe a second time with a file:
`& src-tauri\target\debug\<exe>.exe C:\...\fixtures\math.md`. In tab mode it becomes a tab in the
running window and the window comes to the front, even if it was minimised. In window mode a
second window appears. Its own title bar shows the file, and launching again from it doesn't
forward to the first. Do both with a relative path from a different cwd. **Commit:** `Open files
from Explorer in a tab or a new window`.

---

## Phase 8: Fixtures, README, installer

1. `fixtures/tabs/`: `one.md` and `two.md`, which link to each other, plus
   `a/README.md` and `b/README.md` for the label suffix. Add a short note at the top of each file
   saying what to check.
2. `README.md`: tabs, the new shortcuts, the "Open files in" setting, and that tabs aren't restored
   on relaunch.
3. `pnpm tauri build`, install it, then double-click two `.md` files in Explorer in each mode. Also
   try "Open With" and selecting 3 files → Enter. In tab mode all 3 should become tabs.

**Verify:** the full definition of done (`CLAUDE.md` §2), plus a manual run through every
fixture, including `huge.md` in a tab next to others. **Commit:** `Document tabs and add tab
fixtures`.

---

## Risks and things to watch

- **Losing unsaved work** is the main risk. Every close path (tab ×, middle-click, Ctrl+W, window
  close, Save As collision) has to go through `confirmDiscard()` on the tab that is on screen. The
  Phase 4 tests cover this; keep them.
- **Several processes in window mode** each keep their own in-memory settings. Only `openFilesIn`
  is re-read on demand (Phase 7.8). The other settings already work this way today, so don't
  widen the scope.
- If the first process closes while windows it started are still open, the next Explorer launch
  becomes the new primary. That's acceptable; don't try to hand the primary role over.
- Memory: each tab holds its text and a CodeMirror state. Ten `huge.md` tabs should still be fine.
  Report the working set if it looks high.

## Report back

A table: each phase → **done / partly done / skipped**, with one line for anything not fully done.
Include the tab-switch timing for `huge.md`, screenshots (light and dark, overflow, duplicate
names), any capability you had to add, and a reminder of the "decisions this plan makes"
listed in §0 so Bilal can confirm them.
