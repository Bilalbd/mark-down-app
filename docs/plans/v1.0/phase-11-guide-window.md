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

- [ ] `pnpm test` (the count before and after, with removed tests accounted for), `pnpm lint`,
  `npx tsc --noEmit`, `pnpm format`, `cargo check`, `cargo test`, `cargo clippy` (no new warnings).
- [ ] Dev app, real CDP events:
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
- [ ] In *New window* mode: still one guide window per process, and file opens unaffected.
- [ ] A release build (`pnpm tauri build` isn't needed; `cargo build --release` plus `pnpm build` is
  enough if the guide route depends on the URL form) confirms the window loads outside dev. Say how
  you checked.
- [ ] Commit: `Show the guide in its own read-only window`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
