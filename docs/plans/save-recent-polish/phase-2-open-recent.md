# Phase 2: Open recent in the new-tab (+) menu

**Goal:** the `+` menu at the end of the tab strip gets a third item, **Open recent ›**. Hovering it
or pressing → on it opens a **side flyout**, a second small panel next to the menu, listing the
recent files. Clicking a file opens it (following the "Open files in" setting) and closes both
panels.

Read `docs/plans/save-recent-polish/README.md` (decisions and rules) first, then
`src/components/Tabs/TabStrip.tsx` + `TabStrip.css` (the existing `+` menu: `tabstrip__menu`,
`tabstrip__dropdown`, keyboard handling), `src/store/settings.ts` (`recentFiles`,
`removeRecentFile`), `src/store/tabs.ts` (`openPath`) and `src/lib/tauri.ts` (`basename`, `dirname`).

## Files

- `src/components/Tabs/TabStrip.tsx`, `src/components/Tabs/TabStrip.css`
- Optionally a small pure helper plus tests (see task 4)

## Tasks

- [ ] **1. The item.** Add a third `role="menuitem"` button after **Open file…**:
  `History` icon (`lucide-react`, the same `MENU_ICON` props), text **Open recent**, and a
  `ChevronRight` on the right instead of a shortcut. Give it `aria-haspopup="menu"` and
  `aria-expanded={flyoutOpen}`. Wrap the item and its flyout in a
  `<div className="tabstrip__submenu">` with `position: relative`.
- [ ] **2. The flyout.** When open, render next to the item:
  ```tsx
  <div className="tabstrip__dropdown tabstrip__flyout" role="menu" aria-label="Recent files">
    {recentFiles.length === 0
      ? <div className="tabstrip__empty">No recent files</div>
      : recentFiles.map((p) => (
          <button role="menuitem" key={p} title={p} onClick={…}>
            <span className="tabstrip__recent-name">{basename(p)}</span>
            <span className="tabstrip__recent-dir">{dirname(p)}</span>
          </button>
        ))}
  </div>
  ```
  - Read `recentFiles` with its own settings selector.
  - Clicking a file: close the flyout and the menu, then `void openPath(p)` (import from
    `@/store/tabs`). `openPath` already removes a file that can't be opened from the recent list
    and shows the error, so don't duplicate that.
  - Opening: `onMouseEnter` on the `tabstrip__submenu` wrapper opens it. `onMouseLeave` closes it
    after a short delay (~150ms, cleared if the pointer comes back), so moving diagonally onto the
    flyout doesn't close it. Clicking the item toggles it. ArrowRight or Enter on the item opens it
    and focuses its first file. In the flyout, ArrowUp/ArrowDown move, and ArrowLeft or Escape
    close the flyout and put focus back on the Open recent item (Escape there must **not** close the
    whole menu; stop propagation or check it in the menu's Escape handler).
  - Closing the main menu (outside click, Escape on the main menu, picking New/Open) also closes the
    flyout.
- [ ] **3. Position and CSS** (`TabStrip.css`, tokens only):
  - `.tabstrip__flyout`: `top: -4px; left: calc(100% + 4px); min-width: 240px; max-width: 360px;`
    (it reuses `.tabstrip__dropdown`'s look; override its `top`/`left`).
  - If the flyout would go past the window's right edge, open it to the **left** instead
    (`right: calc(100% + 4px); left: auto`). Decide in a layout effect from
    `getBoundingClientRect()` of the menu vs `window.innerWidth`, and set a class such as
    `is-left`.
  - A file row: two lines. `.tabstrip__recent-name` in `--chrome-fg`, and below it
    `.tabstrip__recent-dir` in `--chrome-fg-muted` at 11px. Both truncate with ellipsis
    (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0`). The row gets
    `height: auto; padding: 5px 10px; flex-direction: column; align-items: flex-start;` Override
    just for flyout rows; don't change the main menu items.
  - `.tabstrip__empty`: muted, 12.5px, padded like an item.
  - The flyout must not be clipped by the title bar or the tab list (check it in the screenshot).
- [ ] **4. Pure helper (optional but preferred):** if you need logic to decide left vs right, put it
  in `src/lib/tabs.ts` as `flyoutSide(menuRight: number, flyoutWidth: number, viewportWidth: number):
  'right' | 'left'` with tests in `tabs.test.ts`.

## Verify

- [ ] `pnpm test` (count doesn't go down; up if you added the helper), `pnpm lint`,
  `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check with `fixtures\gfm.md`. First make sure there are recent files: open
  `math.md`, `mermaid.md` and `links.md` from `fixtures` with `__mdv.tabs.getState().openInTab(…)`
  (they're added to recent files), and read back `__mdv.settings.getState().recentFiles`.
  1. Open the `+` menu, then dispatch `mouseenter` on the Open recent wrapper (or click the item).
     Read back the flyout's items (names and titles). Screenshot in dark and light, Read them and
     describe where the flyout sits and whether anything is clipped.
  2. Keyboard: focus the Open recent item, ArrowRight (the first file is focused), ArrowDown (the
     second), ArrowLeft (the flyout closes, focus is back on Open recent). Read back
     `document.activeElement.textContent` after each step.
  3. Click the second file: the menu and flyout close, and the file is the active tab (read back the
     active document's path).
  4. Set `recentFiles` to `[]` (`__mdv.settings.getState().set('recentFiles', [])`, then put the
     list back afterwards, or re-open the files), open the flyout, and confirm "No recent files".
  5. Flip to the left: open enough tabs (copies of fixtures in your scratchpad) that the `+` button
     sits near the right edge, open the flyout, and confirm it has the `is-left` class and stays
     inside the window (its `getBoundingClientRect().right` ≤ `window.innerWidth`). If you can't get
     the `+` close enough to the edge, say so; the helper's unit test then covers the logic.
  6. Put the theme and recent files back, and stop the app.
- [ ] Commit: `Add Open recent to the new-tab menu`.

## Report

_(Fill in: outputs per step, screenshot paths, anything you couldn't test.)_
