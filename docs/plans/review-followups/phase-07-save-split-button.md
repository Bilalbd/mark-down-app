# Phase 7: Save split button

**Item:** D1. **README:** update the Editing bullet if it describes the Save button (check).

Read `docs/plans/review-followups/README.md` first, then `src/components/Toolbar/SaveMenu.tsx`,
`src/components/Toolbar/Toolbar.tsx`, `src/components/Toolbar/Toolbar.css` (`.toolbar__btn`,
`.toolbar__menu`, `.toolbar__dropdown`, `.toolbar__menu-item`) and `ExportMenu.tsx` for comparison.

## Decision (Bilal)

Clicking the **disk icon saves straight away** (Ctrl+S). A small **caret (▾) button** right next to
it opens the existing menu with **Save** (Ctrl+S) and **Save as…** (Ctrl+Shift+S). The two read as
one control, like a Windows split button.

## Look

- The pair sits where the Save button is now, in one wrapper `.toolbar__split`.
- The disk button keeps the normal `.toolbar__btn` size. The caret button is narrow (about 14–16px
  wide, same height), shows `ChevronDown` at size 12 with the shared stroke props, and has
  `aria-label="More save options"`, `aria-haspopup="menu"`, `aria-expanded`.
- Hovering either half highlights **only that half** with `var(--chrome-hover)`. The outer corners
  are rounded (5px) like `.toolbar__btn`, the inner corners where they meet are square, and there's
  a 1px divider between them in `var(--chrome-border)` (or whichever border token the toolbar
  already uses; check `app-theme.css` / `chromeCss.ts`). No raw colours.
- When the menu is open, the caret half gets `.is-active`. The menu opens below and is aligned to
  the **left edge of the disk button**, like the Export menu is aligned to its button.
- Both halves are disabled when there's no document.

## Files

- `src/components/Toolbar/SaveMenu.tsx` (rename nothing; keep the export name `SaveMenu`)
- `src/components/Toolbar/Toolbar.css`

## Tasks

- [ ] **1.** Disk button: `title="Save (Ctrl+S)"`, `aria-label="Save"`, `onClick={() => void save()}`.
  No `aria-haspopup` on it any more.
- [ ] **2.** Caret button opens and closes the menu. Keep the existing menu code (outside click,
  Escape returns focus to the **caret** button, arrow keys, first item focused on open).
- [ ] **3.** CSS for `.toolbar__split` and its two buttons as described above. Keep print styles
  unaffected (the toolbar is hidden when printing; check `base.css`).
- [ ] **4.** Nothing else in the toolbar moves: compare the x position of the Export and theme
  buttons before and after (read `getBoundingClientRect().left` for each) and report the shift.
  A shift equal to the caret's width is expected.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check on a scratch copy of `fixtures/gfm.md`, **both themes**:
  - Stub `save` and `saveAs` on the document store (see the stub pattern in
    `docs/plans/save-recent-polish/README.md`), click the disk button via
    `document.querySelector(...).click()`, show `save` was called once and the menu didn't open.
  - Click the caret: the menu opens; click Save as…: `saveAs` called once. Restore the real
    actions.
  - Screenshots: toolbar with the menu open, and with a hover preview on each half. CDP can't hover,
    so add a temporary page-only style that applies the hover background to an element with a
    `hover-preview` class (as in `docs/plans/home-recent-and-tab-hover/phase-2-tab-hover.md`), add
    the class to one half at a time, crop the toolbar area and enlarge 3×. Describe the corners and
    the divider. Remove the style afterwards.
- [ ] Commit: `Make Save a split button: click saves, caret opens Save as`.

## Report

(fill in: tests before → after, the stub call logs, the x-shift numbers, screenshot paths)
