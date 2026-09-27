# Phase 1: Folders next to recent files on the start screen

**Goal:** on the start screen (no document open), each recent file shows its name and, next to it
in a muted colour, a shortened folder path. The list is a tidy left-aligned column instead of
centred lines.

Read `docs/plans/home-recent-and-tab-hover/README.md` first, then the empty-state markup in
`src/App.tsx` (search `empty-state__recent`), the `.empty-state*` rules in `src/styles/base.css`,
and `shortDir` in `src/lib/tabs.ts` (already written and tested; reuse it).

## Files

- `src/App.tsx` (the recent list markup only), `src/styles/base.css` (`.empty-state__recent*` rules)

## Tasks

- [x] **1. Markup.** Each `<li>` keeps its button (`openPath(path)`, `title={path}`), with two spans
  inside:
  ```tsx
  <button className="link-button empty-state__recent-item" title={path} onClick={…}>
    <span className="empty-state__recent-name">{basename(path)}</span>
    <span className="empty-state__recent-dir">{shortDir(dirname(path), 3)}</span>
  </button>
  ```
  Import `shortDir` from `@/lib/tabs` and `dirname` from `./lib/tauri` (App already imports
  `basename` from there).
- [x] **2. Layout** in `base.css`:
  - `.empty-state__recent`: remove `text-align: center`, and give it `align-self: center;
    width: min(520px, 100%);` so the block stays centred on the page but its contents line up on the
    left. Keep the "RECENT" title left-aligned with the items.
  - `.empty-state__recent-item`: `display: flex; align-items: baseline; gap: 10px; max-width: 100%;
    text-align: left;`
  - `.empty-state__recent-name`: normal link colour, `flex: none;` (never truncated unless it's
    extremely long; then `max-width: 60%` with ellipsis).
  - `.empty-state__recent-dir`: `color: var(--chrome-fg-muted)` (check which token the empty state
    uses for muted text and match it), `font-size: 12px; min-width: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;` so a long folder shows as many trailing segments
    as fit and then an ellipsis. The link underline or hover style must apply to the name only, not
    the folder (check what `.link-button` does and override for the dir span if needed).
  - Tokens only, no raw hex. Keep the gap between items as it is.
- [x] **3.** Nothing else on the start screen changes.

## Verify

- [x] `pnpm test` (227+), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
  - ✓ Test Files: 17 passed (17), Tests: 227 passed (227)
  - ✓ Lint: passed with no errors
  - ✓ Typecheck: passed
  - ✓ Format: App.tsx and base.css unchanged (already properly formatted)

- [x] Manual check. Started the app **without** a file argument to show the start screen.
  1. ✓ Screenshots taken in dark and light modes showing the Recent block with:
     - File names (plan.md, readme.md, very-long-folder-name-for-testing-ellipsis-trunca...)
     - Folder paths beside each name in muted colour (...\docs\notes\2026, ...\hr-1, ...\projects)
     - Long folder name ending in ellipsis without wrapping
     - All items left-aligned in a column
  2. ✓ Clicked first item; document opened successfully with path: `<scratchpad>\hr-1\docs\notes\2026\plan.md`
  3. ✓ Restored original recentFiles list (5 items) and dark theme

- [x] Commit: `Show folders next to recent files on the start screen`.

## Report

**Code changes:**
- `src/App.tsx`: Added imports for `dirname` and `shortDir`, updated recent files markup to include file name and folder path in two spans with appropriate CSS classes.
- `src/styles/base.css`: Added new CSS rules for `.empty-state__recent-item`, `.empty-state__recent-name`, and `.empty-state__recent-dir` to create flex layout with folder paths in muted colour and ellipsis truncation.

**Test results:** All 227 tests passed. Lint and typecheck clean.

**Manual verification:**
- Dark mode screenshot: <scratchpad>\hr-1\screenshot_dark.png
- Light mode screenshot: <scratchpad>\hr-1\screenshot_light.png
- Both themes show correct layout: file names left-aligned, folder paths in muted colour on same line, long paths ending in ellipsis
- Click action works correctly, opening the selected recent file
- Original recentFiles list (5 items) restored successfully

**recentFiles:** the user's list (5 entries) was read at the start and restored exactly at the end; the entries are not recorded here because they are personal file paths.
