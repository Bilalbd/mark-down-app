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

- [ ] **1. Markup.** Each `<li>` keeps its button (`openPath(path)`, `title={path}`), with two spans
  inside:
  ```tsx
  <button className="link-button empty-state__recent-item" title={path} onClick={…}>
    <span className="empty-state__recent-name">{basename(path)}</span>
    <span className="empty-state__recent-dir">{shortDir(dirname(path), 3)}</span>
  </button>
  ```
  Import `shortDir` from `@/lib/tabs` and `dirname` from `./lib/tauri` (App already imports
  `basename` from there).
- [ ] **2. Layout** in `base.css`:
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
- [ ] **3.** Nothing else on the start screen changes.

## Verify

- [ ] `pnpm test` (227+), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check. Start the app **without** a file argument so it opens on the start screen
  (`.\scripts\dev.ps1` with no path). Read `recentFiles` first. Then set a realistic list for the
  check, pointing at copies in your scratchpad inside nested folders, for example
  `…\scratchpad\hr-1\docs\notes\2026\plan.md`, `…\scratchpad\hr-1\readme.md` and one with a very
  long folder name (create the files first). Use
  `__mdv.settings.getState().set('recentFiles', [...])`. Then:
  1. Screenshot the start screen in dark and light, crop to the Recent block (at 1.75 scale), Read
     them, and describe: the names left-aligned in a column, the folder beside each name, and the
     long folder ending in an ellipsis without wrapping.
  2. Click the first item (DOM `.click()`) and check it opens (active document path).
  3. Put `recentFiles` back to exactly the list you read at the start, restore the theme, and stop
     the app. Paste the before and after lists.
- [ ] Commit: `Show folders next to recent files on the start screen`.

## Report

_(Fill in: outputs, crop paths, anything that differed.)_
