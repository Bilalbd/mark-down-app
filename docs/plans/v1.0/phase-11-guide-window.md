# Phase 11: The guide in its own read-only window

Bilal's request (2026-09-28): the guide shouldn't be editable. Show it only formatted, in a
**separate window** that is "an extremely simple version of the app: a markdown viewer with outline
only". His choice: **outline only**, so no find, zoom, toolbar, tabs or editing.

This replaces Phase 5's approach (the guide opened as a normal file tab).

## Behaviour

- **One guide window per app process**, label `guide`. F1, the toolbar's Guide button, the
  start-screen link and Settings → About → "Open the guide" all open it, or bring it to the front if
  it's already open. It's the same in both *Open files in* modes.
- **Contents:** the app's custom title bar (title "Guide", with minimise, maximise and close), the
  **outline** on the left (the same `Outline` component: click to jump, follows the scroll,
  collapsible and resizable), and the **formatted** guide. Nothing else: no toolbar, tabs, status
  bar, find, zoom, editing, source view, right-click menu or drag-and-drop.
- **Looks:** the app theme and the active preset, the same as the main window, refreshed when the
  window gets focus (the existing settings/presets refresh-on-focus pattern).
- **Links** in the guide: `http(s)`/`mailto:` open externally, `#anchors` scroll, and anything else
  does nothing. The window can never navigate (the Rust navigation guard already covers every
  window; check).
- **Keyboard:** Ctrl+W and Escape close the guide window. F1 in the guide window does nothing.
- **Window:** about 900 × 800 by default, and it remembers its size and position (the window-state
  plugin keys by label; check it saves `guide` separately from `main`). It starts hidden and appears
  once the guide has rendered (no flash, like the main window's `app-ready`), with a fallback reveal
  like the main window's. Closing the main window also closes the guide window.
- **Unsaved work is untouched:** opening or closing the guide never affects documents.

## Design (supervisor decisions)

- **Content source:** move `src-tauri/resources/guide/Guide.md` to `src/guide/Guide.md` and load it
  with Vite's `?raw` import, **dynamically imported** (keep it out of the main bundle's startup
  path). The guide then needs no file access, and the bundle resource goes away.
- **Remove Phase 5's file-based guide plumbing**, which is now dead code: `guidePath()` and its
  cache, `isGuidePath`, the recent-files exclusion, Save → Save as and the Save-as guard for the
  guide, `openGuide()`'s `openPath` route, and the `bundle.resources` entry. Their tests go with
  them; list each removed test in the commit message and Report with the reason. Don't touch any
  other test.
- **Window creation in Rust** (CLAUDE.md: window lifecycle is Rust's job): a command
  `open_guide_window` that focuses the existing `guide` window or builds it with
  `WebviewWindowBuilder` (`decorations: false`, `visible: false`, the app URL with a marker the
  frontend can read, e.g. `index.html#guide`; check that it works in dev and in a release build). It
  gets a typed wrapper in `tauri.ts`.
- **Permissions:** a separate capability file for the `guide` window with **only** what it uses (the
  window controls for its title bar, store read access for settings and presets, events, and the
  opener for external links). Never add the `guide` label to the main capability wholesale. List the
  exact permissions in the Report.
- **Frontend:** `main.tsx` checks the marker and renders a small `GuideWindow` component (in
  `src/components/GuideWindow/`) instead of `App`. It reuses `TitleBar`, `Outline`, the preview
  renderer and the style injection, and nothing that edits.
- **Single-instance and launch args:** the guide window never handles file opens. Opens forwarded
  from Explorer still go to the main window.

## Files

`src-tauri/src/lib.rs` (+ a small module if it helps), `src-tauri/capabilities/`,
`src-tauri/tauri.conf.json`, `src/main.tsx`, `src/components/GuideWindow/*` (new), `src/lib/tauri.ts`,
`src/store/document.ts` and `src/store/tabs.ts` (removals), `src/App.tsx` (F1 and the start-screen
link), `src/components/Toolbar/Toolbar.tsx`, `src/components/Settings/AboutPage.tsx` (from Phase 10),
`src/guide/Guide.md` (moved, then updated to describe the guide window instead of a tab),
`README.md` (the Guide section's path and wording).

## Tests

- `GuideWindow` renders the guide's headings in the outline, and has no editor, toolbar or tabs.
- The wrappers' non-Tauri fallbacks.
- F1, the button and the link call the new wrapper (mocked).
- Rust: any pure helper you add gets a `#[cfg(test)]` test.

## Verify

- [x] `pnpm test` (the count before and after, with removed tests accounted for), `pnpm lint`,
  `npx tsc --noEmit`, `pnpm format`, `cargo check`, `cargo test`, `cargo clippy` (no new warnings).
- [x] Dev app, real CDP events:
  - F1 opens the guide window, and F1 again focuses it (still one window). The button, the link and
    About → "Open the guide" do the same.
  - The guide window has only the title bar, the outline and the formatted guide. Clicking in it and
    pressing keys changes nothing.
  - Ctrl+W and Escape close it. Closing the main window also closes it.
  - Links in it behave as described.
  - Its size and position are remembered across a relaunch.
  - Light and dark, and a preset switch in the main window shows in the guide window after it
    gets focus.
  - Screenshots, which you open and describe.
  - Watch the WebView2 child processes: the guide window must not leave anything running after it
    closes.
- [x] In *New window* mode: still one guide window per process, and file opens unaffected.
- [x] A release build (`pnpm tauri build` isn't needed; `cargo build --release` plus `pnpm build` is
  enough if the guide route depends on the URL form) confirms the window loads outside dev. Say how
  you checked.
- [x] Commit: `Show the guide in its own read-only window`.

## Report

**What changed**
- **Rust:** new `src-tauri/src/guide.rs`. `open_guide_window` (async command, in `generate_handler!`) focuses the `guide`
  window or builds it: `index.html#guide`, 900 x 800, min 480 x 320, centred, `decorations(false)`, `visible(false)`,
  background `#202020`. A `GuideState` mutex stops two quick F1 presses building two windows. It has its own reveal:
  cloaked and shown while it lays out (as the main window is), then uncloaked and focused on a `guide-ready` event the
  frontend emits once the guide and its Mermaid diagram have rendered, with a 5 s fallback. Nothing in the main window's
  reveal (`app-ready`, `REVEALED`, the fallback) or the startup watchdog was touched. `lib.rs` gained
  `.on_window_event`: when `main` is destroyed, the guide window is closed (`close()`, so the window-state plugin still
  saves it). Two `#[cfg(test)]` tests: only `main` closes the guide; the `#guide` marker survives `Url::join` onto the dev
  and release app URLs.
- **Capability** `src-tauri/capabilities/guide.json`, window `guide` only (`default.json` is unchanged and still lists
  only `main`). Permissions, each used: `core:window:allow-start-dragging` (title bar drag region),
  `allow-minimize`, `allow-toggle-maximize`, `allow-is-maximized` (title bar buttons and the maximise icon),
  `allow-close` (close button, Ctrl+W, Escape); `core:event:allow-listen` and `allow-unlisten` (`onResized`,
  `onFocusChanged`), `allow-emit` (`guide-ready`); `store:allow-load`, `allow-get`, `allow-entries`, `allow-reload`
  (settings and presets are read, never written); `opener:allow-open-url` and `opener:allow-default-urls` (external
  links, limited to http, https, mailto and tel). No `core:default`, no `dialog`, `clipboard-manager` or
  `window-state`, no store write (`set`, `save`), no `destroy`, no `set-title`. Checked in the running app: `store.set`
  and `window.set_title` are refused for `guide`; minimise, maximise, restore, close, the focus refresh and an external
  link all work.
- **Frontend:** `main.tsx` renders `GuideWindow` when `location.hash === '#guide'` (and then does not start the
  `emitAppReady` safety timer, which would have revealed the main window). `src/components/GuideWindow/GuideWindow.tsx`:
  `TitleBar`, `Outline`, and its own small formatted view (renders `Guide.md` with `renderMarkdown`, then Mermaid), with
  `StyleInjector` and `useAppTheme`. It reuses `lineAtTop` and `scrollPreviewToLine` from `Preview.tsx`, but not the
  `Preview` component, which has zoom (writes a setting), a right-click menu and links to other files. The guide is
  `import('@/guide/Guide.md?raw')`, so it is out of the main window's startup path. Keys: Ctrl+W and Escape close;
  F1, F5, Ctrl+F, Ctrl+P, Ctrl+R and Ctrl+Shift+R do nothing. No right-click menu. Links go through
  `classifyLink(href, null)`: `#anchor` scrolls, http(s) and mailto open outside, everything else is ignored, and every
  click is `preventDefault`ed. On focus it refreshes only `appTheme` and the presets (not `refreshAll`, which would put
  the outline width back to the value on disk each time the window is focused; the guide's outline width is its own
  until it closes, because it can't write settings).
- **`TitleBar`** got an `allowTabs` prop (default true). Without it the guide window showed the tab strip in "New tab"
  mode (`tabsVisible` is true whenever `openFilesIn` is `tab`), which the new test caught.
- `src-tauri/resources/guide/Guide.md` moved (git mv) to `src/guide/Guide.md`; `tauri.conf.json` no longer bundles it and
  the empty `src-tauri/resources` folder is gone. Text updated: intro, a new "The guide window" section, the shortcuts
  table's F1 row, and the Settings reference's About paragraph. (The "Opening and creating files" section never
  mentioned the guide.)
- `README.md`: Guide section, its link (`src/guide/Guide.md`), and the layout list (`guide.rs`, `src/guide/Guide.md`).
- **Removed (Phase 5's plumbing):** `guidePath()` and its cache, and `resolveResource`, from `tauri.ts`; `isGuidePath`,
  the Recent exclusion, the Save to Save as redirect and the "Can't save over the guide" guard from `document.ts`; the
  `openPath` route in `openGuide()`. `openGuide()` (still in `store/tabs.ts`, so App, Toolbar and About, and their
  tests, are unchanged) now calls the new `openGuideWindow()` wrapper and shows a failure in the document banner. New
  wrappers in `tauri.ts`: `openGuideWindow()` (no-op outside Tauri) and `emitGuideReady()` (idempotent, like
  `emitAppReady`).

**Removed tests, with reasons** (all were about the code removed above):
- `src/lib/tauri.test.ts`, `guidePath`: "resolves to null outside Tauri, without calling resolveResource"; "resolves the
  bundled resource path inside Tauri, and caches it" (`guidePath` is gone).
- `src/store/document.test.ts`: "does not add the guide to recent files when opening it"; "still adds an ordinary file
  to recent files (guide check does not affect other opens)"; "save on the guide routes to Save as with a default name
  of Guide.md"; "saveAs refuses to write over the guide file" (the guide is no longer a document).
- `src/store/tabs.test.ts`, `openGuide`: "does nothing when the guide resource cannot be resolved"; "opens the guide as a
  new tab, and focuses it instead of opening a second copy" (replaced by the two `openGuide` tests below).
  Their `guidePath` mocks went with them. No other test was touched.

**Tests added (17):** `GuideWindow.test.tsx` (8: outline headings; title bar, outline and formatted guide with no
editor, toolbar, tabs, status bar or find; reveal event after render and Mermaid; Escape and Ctrl+W close and F1 does
nothing; no right-click menu; external links; anchors; every other link inert), `App.test.tsx` (3: F1, the toolbar
button and the start-screen link call `openGuideWindow`), `tauri.test.ts` (4: wrapper fallbacks and emit-once),
`tabs.test.ts` (2: `openGuide` calls the wrapper in both modes and touches nothing else; a failure shows in the
banner). The About button's test still passes as it was (it mocks `openGuide`). Rust: 2 new tests.

**Tests: 728 before, 737 after** (-8 removed, +17 added; 49 files). `pnpm lint`, `npx tsc --noEmit`, `pnpm format`
clean. `cargo check` and `cargo test` pass (56 tests). `cargo clippy`: the same 3 warnings as before (`commands.rs` x2,
`watch.rs`), none in new code. (`cargo fmt --check` already reports older diffs in `commands.rs`, `lib.rs` and
`spell.rs`; `guide.rs` is clean.)

**Checked in the running app** (dev build, `--new-window`, own WebView2 profile, real CDP key and mouse events; the
guide's page is a second CDP target, chosen by its `#guide` URL):
- F1 in the main window opened the guide (title bar, outline, formatted guide only). F1 again, and F1 with the guide
  focused, left exactly one guide window (checked by CDP targets, by Win32 top-level windows, and by the page's
  `timeOrigin` not changing).
- Outline click scrolls (the Keyboard shortcuts heading landed at the top) and highlights the active item. Clicks and
  the keys Ctrl+E, Ctrl+Shift+E, Ctrl+S, Ctrl+Shift+S, Ctrl+F, Ctrl+P, Ctrl+R, F5, Ctrl+T, Ctrl+N, Ctrl+O, X, A, Enter and
  F1 in the guide changed nothing: same page, no find bar, and the main window's view mode, tabs, path and dirty state
  were the same.
- Escape, Ctrl+W and the title bar's close button each closed it; WebView2 child processes went 7 to 6 (the guide's
  renderer went away) and it reopened cleanly. Maximise, restore and minimise work. Closing the main window with the
  guide open closed the guide too and the app exited within a second, leaving no WebView2 process from my profile. With
  a dirty document, the close prompt appeared while the guide stayed open, and Cancel kept both and the unsaved text.
- Size and position: I moved and resized it (150,120, 1000 x 700 by Win32 measure); `.window-state.json` got a separate
  `guide` entry (1726 x 1211 physical) next to an unchanged `main`; after a relaunch it opened at the same rectangle.
- Links (real clicks): the footnote anchor scrolled with the URL unchanged; the Wikipedia link opened in Chrome (a
  "Markdown - Wikipedia" tab, twice, from two clicks; I left those tabs alone); `Other.md`, `file:///...` and
  `javascript:` links did nothing and the window did not navigate.
- Look: dark Boulayla, light Boulayla and light Nord screenshots (opened and described; the file hashes differ). In the
  main window I set the theme to light and gave the guide focus (F1): it followed (dark to light). Same for switching the
  preset from Boulayla to Nord (background rgb 251,251,253 to 236,239,244, Open Sans to Inter). Restored to dark and
  Boulayla afterwards.
- "New window" mode (set in memory only): F1 twice gave one guide window and no tab strip; a second app process
  (`--new-window`, own profile and debug port) got its own single guide window while the first kept its own.
- Release build: `pnpm build`, then `cargo build --release --features tauri/custom-protocol` (this repo has no
  `custom-protocol` feature of its own; `tauri build` passes it), run with the Vite server stopped. The page URL is
  `http://tauri.localhost/index.html#guide`, and it loaded (15 sections, 18 outline items, the Mermaid diagram drawn, no
  toolbar) at the remembered size.

**Not verified / caveats**
- Real (not CDP) Ctrl+F, Ctrl+P and F5 in the guide: CDP key events don't reach WebView2's browser shortcuts, so those
  "do nothing" bindings are defensive; I checked them only as page-level keys.
- App commands such as `read_file` are not behind the capability system in this project (there is no `AppManifest`), so
  any window can call them. In the guide window that was confirmed (`read_file` reached the OS). Only the guide's own
  code runs there and its HTML is sanitised, but restricting them needs a build-time app manifest for every command; I
  left that alone. It is worth a decision.
- Two things I saw once and couldn't repeat: early in the first session the guide's Win32 handle changed and the main
  window's document was gone, around a Modern Standby (Kernel-Power 506/507, 10:30 to 10:38). Later runs (a
  per-second watch of the document and window handle after F1, and many F1 / Escape / reopen cycles) did not reproduce
  it. After that a WebView2 browser process stopped answering CDP, and two launches got no `msedgewebview2` child (the
  Phase 12 hang, during another Modern Standby at 10:50:55); I stopped each of my PIDs, waited for the wake event and used
  a fresh profile folder.
- The title bar reads "Markdown - Guide" (the app's title bar with the file name "Guide"), not just "Guide".
- The guide's outline width isn't saved (no store write permission); each open starts from the saved width.
- My first backup command wrote `settings.json`, `presets.json` and `.window-state.json` into `scratchpad\backup\` (a
  folder another agent had already made, which held `settings.json.bak` and `presets.json.bak`) before I noticed and
  moved to `scratchpad\p11\`. Files of those three names in `backup\` are now my copies, so an earlier agent's files of
  the same names there may have been overwritten.

**Files under `%APPDATA%\com.bilal.markdown-viewer\` afterwards:** `presets.json` is identical by value to the backup;
`.window-state.json` is back to only the `main` entry (the `guide` entry I created is removed); `settings.json` equals
the backup by value: I only had to remove my `gfm.md` from `recentFiles`, which is back to his two entries
(`allocate-v3\docs\audits\2026-09-27-remediation-plan.md` and `...-codebase-audit.md`); `spellWords` are `understad`,
`Helo`, `typecheck`, `ESLint`; `spellLanguages` are `en`, `ar`. Every process I started (the dev exe several times, the
second-instance exe, the release exe, Vite and its `pnpm`, and my stuck CDP `node`) was stopped by its PID.

## Supervisor check

_(supervisor fills in)_
