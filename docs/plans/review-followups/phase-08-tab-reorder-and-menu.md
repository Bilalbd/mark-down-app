# Phase 8: Reorder tabs by dragging, and a tab context menu

**Items:** D2, D3, C2. **README:** yes. Mention drag-to-reorder and the right-click menu in the
Tabs bullet. Add `Ctrl+Shift+←/→` (move tab) to the shortcuts tables in the README and
`GeneralTab.tsx` (task 4).

Read `docs/plans/review-followups/README.md` first, then `src/components/Tabs/TabStrip.tsx` and
`TabStrip.css` (all of them), `src/store/tabs.ts` (`move`, `close`), `src/lib/tabs.ts`
(`moveItem`, `flyoutSide`), `src/lib/tauri.ts` (`revealInExplorer`, added in Phase 5), and the
dropdown styles the `+` menu uses (`.tabstrip__dropdown`).

## Decisions (Bilal)

- The right-click menu has: **Close**, **Close others**, **Close to the right**, a separator,
  **Copy path**, **Reveal in File Explorer**. Copy path and Reveal are disabled for Untitled tabs.
  Close others is disabled with one tab; Close to the right is disabled on the last tab.
- Closing from the menu asks about unsaved changes exactly like closing one tab; cancelling any
  prompt stops the whole command (tabs already closed stay closed).

## Supervisor notes

- The store already has `move(from, to)` but nothing calls it (C2). This phase gives it a UI.
- **Use pointer events, not HTML5 drag and drop.** With `dragDropEnabled: true` in
  `tauri.conf.json`, WebView2 doesn't deliver HTML5 `dragstart`/`drop` inside the page. Don't
  change that setting (file drops from Explorer depend on it).
- The app has no custom context menus yet and doesn't suppress the WebView2 one. Only the tab gets a
  custom menu here; everything else keeps today's behaviour.

## Files

- `src/lib/tabs.ts`, `src/lib/tabs.test.ts`
- `src/store/tabs.ts`, `src/store/tabs.test.ts`
- `src/components/Tabs/TabStrip.tsx`, `TabStrip.css`
- New: `src/components/Tabs/TabContextMenu.tsx` (styles go in `TabStrip.css`, reusing the dropdown
  look)
- `src/components/Settings/GeneralTab.tsx`, `README.md`

## Tasks

### Store and helpers

- [x] **1.** In `src/lib/tabs.ts`, add and test:
  ```ts
  /** Index the dragged tab should move to, from the other tabs' horizontal midpoints: the number
   * of other tabs whose midpoint is left of `pointerX`. */
  export function dropIndex(midpoints: readonly number[], fromIndex: number, pointerX: number): number
  ```
  `midpoints` has one entry per tab (including the dragged one, which is skipped). Tests: dragging
  right past one, two and all tabs; left to the start; not far enough to change anything
  (returns `fromIndex`).
  ```ts
  /** Top-left position for a menu opened at (x, y) so it stays inside the viewport. */
  export function menuPosition(
    x: number, y: number, width: number, height: number, viewportW: number, viewportH: number,
  ): { left: number; top: number }
  ```
  Flip left of the point when it would overflow the right edge, above it when it would overflow
  the bottom, and never go below 0. Tests for each case.
- [x] **2.** In the tabs store add `closeOthers(id): Promise<boolean>` and
  `closeToRight(id): Promise<boolean>` (JSDoc on both in `TabsState`). Each takes the list of ids
  to close **at the start**, calls `close(tid)` for them one at a time (left to right), and stops
  and returns `false` the first time `close` returns `false`. At the end (if `id` still exists and
  isn't active), `activate(id)`. Tests in `tabs.test.ts` using the existing test setup: clean tabs
  all close; a cancelled prompt on a dirty tab stops the command and leaves later tabs open; the
  kept tab ends up active.

### Dragging

- [x] **3.** In `TabStrip.tsx`:
  - `onPointerDown` on a tab (left button only, not on the close button): remember the start x,
    the tab's index and the midpoints of all tabs (from `getBoundingClientRect`). Call
    `setPointerCapture`.
  - `onPointerMove`: once the pointer has moved more than 4px horizontally, start dragging: add
    `.is-dragging` to that tab and move it with `transform: translateX(<dx>px)` (inline style).
    The other tabs stay where they are.
  - `onPointerUp`: if dragging, `move(from, dropIndex(midpoints, from, e.clientX))`, clear the
    drag state and swallow the click that follows (a ref flag checked at the top of `onClick`).
    If not dragging, do nothing special (the normal click activates the tab).
  - Escape during a drag cancels it (no move). `pointercancel` also cancels.
  - `.is-dragging` in CSS: raise it above its neighbours (`z-index`), `cursor: grabbing`, and turn
    off any transition on it. Colours from tokens only.
  - The title bar's window-drag region must still work around the tabs (tabs aren't drag regions;
    check you didn't add `data-tauri-drag-region` anywhere new).
- [x] **4. Keyboard.** On a focused tab, Ctrl+Shift+ArrowLeft/ArrowRight moves it one place
  (`move(i, i ± 1)`, no wrap) and keeps focus on it. Add the row to the Settings shortcuts table
  and the README table ("Move tab left / right"). Check it doesn't clash with anything in
  `App.tsx`'s shortcut map.

### Context menu

- [x] **5.** `TabContextMenu.tsx`: `role="menu"`, `position: fixed` at the position from
  `menuPosition` (measure the menu after it renders, like the flyout does with `useLayoutEffect`).
  Items are `<button role="menuitem">` with `disabled` where the rules above say, a
  `<div role="separator">` before Copy path, and the same look as `.tabstrip__dropdown` items.
  Keyboard: first enabled item focused on open, ArrowUp/Down skip disabled items, Enter/Space run,
  Escape closes and returns focus to the tab. Click outside, window blur and scrolling the tab strip
  close it.
- [x] **6.** Open it from `onContextMenu` on a tab (`preventDefault`) at the pointer, and from
  Shift+F10 or the ContextMenu key on a focused tab at the tab's bottom-left corner.
  Right-clicking a tab doesn't activate it.
- [x] **7.** Actions: Close → `close(id)`; Close others → `closeOthers(id)`; Close to the right →
  `closeToRight(id)`; Copy path → `navigator.clipboard.writeText(path)` with
  `.catch(() => undefined)` and a comment; Reveal → `revealInExplorer(path)` with
  `.catch(() => undefined)`. The menu closes before an action runs. Get each tab's path the same way
  the tab labels do (active tab from the document store, others from the snapshot).

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Manual check with four scratch tabs (`fixtures/tabs/one.md`, `two.md`, `fixtures/gfm.md`, (done by the supervisor, see below)
  `fixtures/math.md` copies), **both themes**:
  - Drag: dispatch `pointerdown` / several `pointermove` / `pointerup` events (`PointerEvent` with
    `pointerId: 1`, `button: 0`, `clientX`) on the first tab to past the third tab's midpoint.
    Show the tab order (labels) before and after, and that the active tab didn't change from the
    drag's click. Take a screenshot mid-drag (after a `pointermove`, before `pointerup`) showing
    the lifted tab.
  - Keyboard: Ctrl+Shift+ArrowRight on the focused active tab; show the new order.
  - Menu: dispatch `contextmenu` (`MouseEvent`, `clientX/Y` near the right edge of the window) on
    the last tab; screenshot it (both themes) and show it stays inside the window. Show Close to the
    right is disabled there. Run Close others on the second tab with all tabs clean; show one tab is
    left. Make one tab dirty, run Close others again from a fresh set, click Cancel in the prompt,
    show the command stopped. Don't run Reveal (it opens Explorer); check Copy path with
    `await navigator.clipboard.readText()` if permitted, otherwise say it couldn't be read.
  - Discard all edits; don't save.
- [x] Commit: `Reorder tabs by dragging and add a tab context menu`.

## Report

(fill in: tests before → after, order before/after each check, screenshot paths)

## Supervisor check

Diff reviewed. Fixed directly (follow-up commit):
- **Wrong path in the menu:** TabStrip passed the *active* document's path as `tabPath` for every
  tab, so Copy path / Reveal on an inactive tab used the active tab's file; "untitled" was also
  guessed from the label (a real `Untitled notes.md` would have been treated as untitled). Each tab
  item now carries its own path. New `TabStrip.test.tsx` (fails on a78c46c, passes now).
- Escape didn't return focus to the tab (the agent's report said it did); it does now.
- Inline styles for `position: fixed`, `z-index` and the separator moved to CSS classes
  (`.tabstrip__context`, `.tabstrip__separator`); only the computed left/top stay inline.
- Found in the app: disabled menu items looked enabled, and items with and without icons didn't
  line up. Added a disabled style and icons for Close others / Close to the right.

`pnpm test` 316 passed (26 files); lint, tsc clean.

**Manual check (supervisor, four scratch tabs one/two/gfm/math):** dragging the first tab (pointer
events) to three-quarters of the third tab moved it to index 2 (`move(0, 2)`), the tab showed
`.is-dragging` with a translateX mid-drag (screenshot), and the drop didn't change the active tab.
Ctrl+Shift+← on the active last tab called `move(3, 2)` and kept focus on it; Ctrl+Shift+→ on the
last tab did nothing. (Bilal moved tabs by hand during one run; the numbers above are from a clean
rerun.) Right-click on the last tab near the right edge: menu flipped left and stayed inside the
window (x 1426–1626 of 1646), Close to the right disabled, first item focused; screenshots in dark and
light. Close others with a dirty tab: the prompt appeared, Cancel stopped the command and every tab
stayed; with all clean it left only the chosen tab, active. The `+` menu still shows New file / Open
file… / Open recent. Clipboard contents couldn't be read back from the page (NotAllowedError); Copy
path is covered by the unit test. Settings equal to the backup at the end.

Note for the supervisor: synthetic pointer events must use `pointerId: 1` (the mouse); any other id
makes `setPointerCapture` throw, so a synthetic drag silently does nothing.
