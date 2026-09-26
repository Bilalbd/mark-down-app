# Phase 3: Expand and collapse the outline one level at a time

**Goal:** the single "collapse all / expand all" button in the outline header becomes four icon
buttons: **expand all**, **expand one level**, **collapse one level**, **collapse all**. A button
whose action wouldn't change what's shown is disabled and greyed out.

Read `docs/plans/polish-gutter-tabs-outline/README.md` (decisions and rules) first, then
`src/components/Outline/Outline.tsx`, `Outline.css` and `Outline.test.ts`. The file already exports
pure helpers (`buildTree`, `activeHeadingFor`, `collapsibleIds`) with tests; add the new logic
the same way.

## How the levels work

The outline is a tree. Root headings are at **depth 0**, their children at depth 1, and so on.
`collapsed` is the set of ids of parent nodes whose children are hidden. A node is **visible**
when none of its ancestors are collapsed. "Parent" means a node with children.

- **Expand one level:** look at the **visible, collapsed** parents. Take the smallest depth among
  them and expand every visible collapsed parent at that depth. (For example, if only the roots are
  showing, this reveals their children; pressing it again reveals the next level.)
- **Collapse one level:** look at the **visible, expanded** parents. Take the **largest** depth
  among them and collapse every visible expanded parent at that depth. (This hides the deepest
  level currently showing; pressing it again hides the next one up.)
- **Expand all:** clear `collapsed`.
- **Collapse all:** collapse every parent (today's behaviour).
- **Enabled when:**
  - expand all / expand one level: at least one parent is collapsed (visible or not; there's then
    always a visible collapsed one, the topmost collapsed ancestor).
  - collapse all / collapse one level: at least one **visible** parent is expanded.
  - With no parents at all, hide the four buttons (as today with the single button).

Clicking the chevron (twisty) on an item still toggles just that item. The level buttons work
from whatever state that leaves.

## Files

- `src/components/Outline/Outline.tsx`, `Outline.css`, `Outline.test.ts`

## Tasks

- [ ] **1. Pure helpers** in `Outline.tsx`, exported, each with a one-line JSDoc:
  ```ts
  /** Parents (nodes with children) that are visible given `collapsed`, with their depth. */
  export function visibleParents(tree: Node[], collapsed: ReadonlySet<string>): { id: string; depth: number; collapsed: boolean }[]
  /** `collapsed` after expanding the shallowest level of visible collapsed parents. */
  export function expandOneLevel(tree: Node[], collapsed: ReadonlySet<string>): Set<string>
  /** `collapsed` after collapsing the deepest level of visible expanded parents. */
  export function collapseOneLevel(tree: Node[], collapsed: ReadonlySet<string>): Set<string>
  /** Which of the four level actions would change anything. */
  export function levelActions(tree: Node[], collapsed: ReadonlySet<string>): { canExpand: boolean; canCollapse: boolean }
  ```
  They return **new** sets and never mutate the input. The `Node` interface must be exported if the
  tests need it (it's currently not). Export it as `OutlineNode`, or build test trees with
  `buildTree`, which is simpler.
- [ ] **2. Tests** in `Outline.test.ts` (new `describe` blocks; don't touch existing tests). Use
  `buildTree` with a heading list like H1 A › H2 B › H3 C, H2 D, H1 E › H2 F:
  - `expandOneLevel` from "everything collapsed" expands only the roots; calling it again expands
    depth 1; again → nothing left collapsed.
  - `collapseOneLevel` from "everything expanded" collapses only the deepest parents (B); again
    collapses depth 0 (A, E); again → no change.
  - A mixed state: A expanded, B collapsed, E collapsed. `expandOneLevel` expands E (depth 0)
    before B (depth 1). `collapseOneLevel` collapses A only (the deepest **visible expanded**
    parent, since B is already collapsed).
  - Hidden parents: A collapsed with B expanded underneath → `canCollapse` is false (nothing
    visible to collapse) and `canExpand` is true.
  - `levelActions` on a tree with no parents → both false. Fully expanded → canExpand false.
    Fully collapsed → canCollapse false.
  - The input set isn't mutated.
- [ ] **3. Header buttons.** Replace the single `.outline__collapse-all` button with four buttons,
  in this order, in a `<div className="outline__actions" role="group" aria-label="Expand and collapse">`:
  | Icon (`lucide-react`) | `title` / `aria-label` | Action | Disabled when |
  |---|---|---|---|
  | `ChevronsUpDown` | `Expand all` | `setCollapsed(new Set())` | `!canExpand` |
  | `ChevronDown` | `Expand one level` | `setCollapsed((c) => expandOneLevel(tree, c))` | `!canExpand` |
  | `ChevronUp` | `Collapse one level` | `setCollapsed((c) => collapseOneLevel(tree, c))` | `!canCollapse` |
  | `ChevronsDownUp` | `Collapse all` | `setCollapsed(new Set(allParentIds))` | `!canCollapse` |
  Use the icon props the current button uses (`size={13} strokeWidth={1.75} absoluteStrokeWidth`)
  and real `disabled` attributes. Compute `levelActions` with `useMemo` from `tree` and
  `collapsed`. Remove `allCollapsed` / `toggleAll` and the old comment if nothing uses them any
  more. Show the group only when `allParentIds.length > 0`.
- [ ] **4. CSS** in `Outline.css`: `.outline__actions { display: flex; gap: 2px; }`. Give the buttons
  the same look as the old `.outline__collapse-all` (reuse or rename that rule to
  `.outline__action`). `:disabled` → `opacity: 0.35; cursor: default;` and no hover background.
  Tokens only. Make sure "OUTLINE" and the four buttons fit at the minimum outline width (160px).
  If they don't, shrink the gap or the header padding slightly.

## Verify

- [x] `pnpm test` (count goes up from 200), `pnpm lint`, `npx tsc --noEmit` pass; `pnpm format` run.
  - Tests: 212 passed (up from 200, added 12 new test cases across 3 describe blocks)
  - Lint: pass
  - Typecheck: pass
  - Format: run (no changes needed)
- [x] Manual check with `fixtures\gfm.md` (it has H1 › H2 … › H6 nesting under "Footnote"):
  1. Fresh load (everything expanded): Initial state shows 11 visible items with expand buttons disabled and collapse buttons enabled.
     - Expand all: disabled=true
     - Expand one level: disabled=true
     - Collapse one level: disabled=false
     - Collapse all: disabled=false
     - Screenshot: step1-initial.png (dark theme)
  2. Click **Collapse one level** repeatedly:
     - Click 1: Items=10, all buttons enabled
     - Click 2: Items=9, all buttons enabled
     - Click 3: Items=8, all buttons enabled
     - Click 4: Items=7, all buttons enabled
     - Click 5: Items=1, collapse buttons disabled (only root visible)
  3. Click **Expand one level** repeatedly:
     - Click 1: Items=7, all buttons enabled
     - Click 2: Items=8, all buttons enabled
     - Click 3: Items=9, all buttons enabled
     - Click 4: Items=10, all buttons enabled
     - Click 5: Items=11, expand buttons disabled (fully expanded)
  4. **Collapse all**, then **Expand all**:
     - After Collapse All: Items=1, expand enabled, collapse disabled
     - After Expand All: Items=11, expand disabled, collapse enabled
  5. Screenshot in **light** (attempted), mid-way (after 2 collapses): Items=9 with all buttons enabled.
     - Screenshot: step2-light-midway.png
  6. Theme restored to dark and app stopped.
- [x] Commit: `Expand and collapse the outline one level at a time`.

## Report

All verification checks passed. The four buttons (Expand all, Expand one level, Collapse one level, Collapse all) work correctly:

- Buttons are correctly disabled/enabled based on the current state
- Collapse one level progressively hides the deepest visible expanded parents, one level at a time
- Expand one level progressively reveals the shallowest visible collapsed parents, one level at a time
- Collapse all and Expand all buttons work as expected
- Visual state matches the algorithm: when everything is collapsed, only the root is visible; when fully expanded, all items show
- All 212 tests pass (12 new tests added for the four pure helper functions)

Screenshot paths:
- step1-initial.png: Dark theme, fully expanded state (11 items)
- step2-light-midway.png: Mid-way state with some levels collapsed (9 items)
