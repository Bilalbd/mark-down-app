# Phase 8: Keep the Heading submenu open on the way to it

Bilal's report (2026-09-28): in the editor's right-click menu, the **Heading** submenu closes almost
immediately when the pointer moves towards it to pick a heading.

## Cause

`src/components/ContextMenu/ContextMenu.tsx`: every plain item's `onMouseEnter` starts a
`SUBMENU_CLOSE_DELAY_MS` (150 ms) timer that closes an open submenu. The submenu opens to the side
of "Heading", so a normal diagonal path from "Heading" to, say, "Heading 3" passes over "Bold" and
"Italic" first. That starts the timer, and the submenu is gone before the pointer arrives. The tab
strip's "Open recent" flyout (`src/components/Tabs/TabStrip.tsx`) uses the same pattern and likely
has the same problem.

## Fix: "menu aim" (the safe-triangle technique used by native menus)

While a submenu is open, keep it open as long as the pointer is **moving towards it**: inside the
triangle formed by the pointer's last position and the submenu's near-side top and bottom corners.
Only when the pointer rests on another item (or moves away from the submenu) does the close timer
run. Details:

- Track the last few pointer positions (`mousemove` on the menu).
- When a plain item is entered while a submenu is open: if the pointer is inside the triangle
  (last position → submenu near edge top/bottom corners, with a few pixels of tolerance), don't
  close. Re-check on the next `mousemove`, and close only when a move leaves the triangle or the
  pointer stays still on the item for 300 ms.
- Entering the submenu cancels any pending close (it already does).
- No gap between the item and its submenu that can fire `mouseleave` (check the CSS; overlap them by
  a pixel or two if needed).
- The pure geometry goes in a helper with unit tests: `isInsideSafeTriangle(point, apex, top,
  bottom): boolean` in `src/lib/menuAim.ts`, plus `movingTowards(prev, next, rect)` if you need it.
- Apply the same fix to the tab strip's "Open recent" flyout if it has the same problem (check it
  first and say what you found).
- Keyboard behaviour doesn't change.

## Tests

- `menuAim.test.ts`: inside, outside, on the edges, a submenu on the left (flipped flyout), and a
  degenerate triangle.
- `ContextMenu.test.tsx`: a regression test that fails on the current code. Open the submenu,
  simulate `mouseenter` + `mousemove` on the next item along a path towards the submenu, advance fake
  timers past 150 ms, and the submenu must still be open. A second test covers resting on the item
  (no further moves) for 300 ms, after which it closes.

## Verify

- [ ] `pnpm test` (write the count before and after), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Dev app, real CDP mouse events (`Input.dispatchMouseEvent`, a series of `mouseMoved` steps a few
  pixels apart, like a person's diagonal movement): right-click in the editor, hover "Heading", then
  move diagonally down-right across "Bold"/"Italic" to "Heading 3" and click. The line becomes
  `### …`. Repeat with the menu opened near the right edge of the window, so the submenu flips to
  the left. Also check that moving straight down from "Heading" to "Bold" and resting there closes
  the submenu.
- [ ] The same diagonal move in the tab strip's "Open recent" flyout, if you changed it.
- [ ] Commit: `Keep submenus open while the pointer heads towards them`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
