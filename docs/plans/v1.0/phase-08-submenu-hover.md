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

- [x] `pnpm test` (write the count before and after), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Dev app, real CDP mouse events (`Input.dispatchMouseEvent`, a series of `mouseMoved` steps a few
  pixels apart, like a person's diagonal movement): right-click in the editor, hover "Heading", then
  move diagonally down-right across "Bold"/"Italic" to "Heading 3" and click. The line becomes
  `### …`. Repeat with the menu opened near the right edge of the window, so the submenu flips to
  the left. Also check that moving straight down from "Heading" to "Bold" and resting there closes
  the submenu.
- [x] The same diagonal move in the tab strip's "Open recent" flyout, if you changed it.
- [x] Commit: `Keep submenus open while the pointer heads towards them`.

## Report

**What I found**

- **Editor menu (`ContextMenu`)**: as the phase document describes, entering any plain item started
  a 150 ms close timer. A second cause the document doesn't mention: the same `onMouseEnter` ran
  for the items *inside* the submenu, so hovering a submenu item (e.g. "Heading 3") also started
  the close timer, and the submenu closed 150 ms after the pointer reached it. A unit test
  (`keeps the submenu open while the pointer is on one of its items`) fails on the old code. In
  the running app a click still landed because it comes within 150 ms, so it was only noticeable
  when resting on a submenu item.
- **Tab strip "Open recent" flyout: it has the same problem.** The wrapper's `mouseleave` started
  the 150 ms timer, and a diagonal move from the left part of "Open recent" to the last flyout
  item leaves the wrapper through its bottom edge and crosses empty space. On the old code, a real
  CDP move in 3 px steps 16 ms apart ended with the flyout closed (`openAtTarget: false`).
- **No gap fix needed.** Items have no `mouseleave` handler, and the ~5 px between "Heading" and
  its submenu (the menu's padding and border) starts no timer, so I left the CSS alone.

**What changed**

- `src/lib/menuAim.ts` (new): `isInsideSafeTriangle(point, apex, top, bottom, tolerance)` (any
  corner order; a degenerate triangle contains nothing), `nearEdgeCorners(apex, box)` (picks the
  submenu's left or right edge depending on which side it opened, so flipped submenus work) and
  `isHeadingForSubmenu(point, apex, box)` (2 px tolerance).
- `ContextMenu.tsx`: keeps the last three pointer positions from `mousemove` on the menu. Entering
  a plain item while a submenu is open: if the pointer is inside the triangle from where the move
  began (oldest recent position) to the submenu's near edge, the close timer becomes a 300 ms rest
  timer instead of 150 ms; each further `mousemove` inside the triangle restarts it, and the first
  move outside it closes after the usual 150 ms. Entering the submenu (or another submenu trigger)
  cancels everything. Items inside the submenu no longer start a close timer. Keyboard handling is
  untouched.
- `TabStrip.tsx`: same idea for the flyout. `mouseleave` on the "Open recent" wrapper checks the
  triangle towards the flyout; a window `mousemove` listener (only while the flyout is open) keeps
  tracking. Entering the flyout (a descendant of the wrapper) cancels the timer as before.
- Tests: `menuAim.test.ts` (13: inside, outside each edge, on edges and corners, tolerance,
  flipped/mirrored, corner order, degenerate, `nearEdgeCorners`, `isHeadingForSubmenu`),
  `ContextMenu.test.tsx` (6 new), `TabStrip.test.tsx` (4 new).

**Regression test failing on the old code** (`ContextMenu.test.tsx`, "keeps the submenu open while
the pointer crosses another item on the way to it"; mouse enters "More", moves 3 times, enters
"Three" heading for the submenu, `advance(200)`):

```
AssertionError: expected false to be true // Object.is equality
 FAIL  ... > submenu hover aim > keeps the submenu open while the pointer crosses another item on the way to it
    235|       expect(submenuOpen()).toBe(true);
```

Also failing on the old code: "closes the submenu after the pointer rests on that item for 300 ms"
(closed at 299 ms instead of 300 ms) and "keeps the submenu open while the pointer is on one of its
items". In `TabStrip.test.tsx`, "keeps the flyout open while the pointer leaves "Open recent"
heading for it" and "closes the flyout after the pointer rests outside for 300 ms" failed the same
way (`expected false to be true`). The tests that close after 150 ms pass on old and new code (they
guard the unchanged behaviour).

**Verify**

- `pnpm test`: 675 before, **698** after (+23). `pnpm lint`, `npx tsc --noEmit` clean; `pnpm format`
  changed only my files. No Rust changes, so no `cargo test`.
- In-app, real CDP `Input.dispatchMouseEvent` (a `mouseMoved` every 3-6 px, 10-16 ms apart, then
  `mousePressed`/`mouseReleased`), dev build with a scratch `WEBVIEW2_USER_DATA_FOLDER`, copy of
  `fixtures/gfm.md`, Source view:
  - Right-click at a line, hover "Heading" (submenu opens on the right), diagonal move across
    "Bold"/"Italic" to "Heading 3", click: the line became `### This file exerci...`. Submenu still open
    just before the click.
  - Same with the menu opened at x=1050 in a 1100 px window: submenu opened on the **left**;
    down-left diagonal to "Heading 3", click: `### Plain, *italic*, ...`.
  - Straight down from "Heading" to "Bold" and resting: submenu closed (open at 0 ms after
    arrival, closed by 500 ms).
  - Repeated with 3 px steps 16 ms apart and in the light theme (`appTheme` set with
    `persist: false`): same results. (Later runs hit lines that were already `###`, so "Heading 3"
    toggled them back to a paragraph; the line changed each time.)
  - **Before the fix** (old `ContextMenu.tsx` swapped in temporarily, then restored): the same
    diagonal ended with the submenu already closed (`openAtTarget: false`) in both the right and
    flipped cases.
  - Tab strip: "+" then "Open recent", diagonal move (3 px / 16 ms and 6 px / 10 ms) to the last
    flyout item ("Clear recent files", not clicked): flyout still open after the fix
    (`openAtTarget: true`), closed on the old code. Screenshots in dark and light looked right.
  - Screenshots in my scratchpad (`p8\*.png`), viewed: `fixed-flipped.png` (dark, flipped),
    `lightfix-right.png` (light), `fixedtab-tab.png` (dark), `lighttab-tab.png` (light).
- Docs: `README.md` doesn't describe submenu behaviour (no match for submenu/flyout/hover).
  `Guide.md` only lists what the Heading submenu contains, so nothing changed.
- Settings: backed up `settings.json`, `presets.json` and `.window-state.json` first. My fixture was
  the only `recentFiles` change; I removed it. Compared by value (key by key), all three files match
  the backups. Final `recentFiles` on disk:
  `["C:\\Agents Projects\\allocate-v3\\docs\\audits\\2026-09-27-remediation-plan.md", "C:\\Agents Projects\\allocate-v3\\docs\\audits\\2026-09-27-codebase-audit.md"]`
  (as JSON on disk)
  (the app writes keys in a different order than my backup; values are identical).
- Processes: stopped only the PIDs I started (dev exe 19172, Vite 20360 and its `cmd` wrapper
  24468, each confirmed by command line). Bilal's installed app was not running and I never
  touched it.

**Not done / follow-ups**

- The tab strip's flyout tracks the pointer with a window `mousemove` listener only while it is
  open, so a fast flick from the button straight to the flyout with no intermediate moves has no
  apex and falls back to the old 150 ms rule (the pointer normally arrives well within that).
- Nothing else touched.

## Supervisor check

Built by a Sonnet 5 agent (`52c5c7b`). Diff reviewed: pure geometry in `src/lib/menuAim.ts` (tested),
a 3-point pointer trail and aim apex in `ContextMenu.tsx`, items inside the submenu no longer start
a close timer (a second cause the agent found), and the same aim logic for the tab strip's
"Open recent" flyout (which had the same bug). Re-run: `pnpm test` 698, lint and tsc clean.

In-app, supervisor (`scratchpad/supervisor/aim.mjs`, real CDP `mouseMoved` steps of 5 px every
14 ms):
- Diagonal from "Heading" across Bold/Italic to "Heading 3", submenu on the right: open on arrival,
  the click gives `### Line one`.
- Menu opened near the right edge, submenu flipped to the left: the same result.
- Straight down to "Bold" and resting: the submenu closes.

Bilal's settings and presets are unchanged; his `recentFiles` is exactly his two entries (the
agent's report was accurate this time).
