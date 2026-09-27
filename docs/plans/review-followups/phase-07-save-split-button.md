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

- [x] **1.** Disk button: `title="Save (Ctrl+S)"`, `aria-label="Save"`, `onClick={() => void save()}`.
  No `aria-haspopup` on it any more.
- [x] **2.** Caret button opens and closes the menu. Keep the existing menu code (outside click,
  Escape returns focus to the **caret** button, arrow keys, first item focused on open).
- [x] **3.** CSS for `.toolbar__split` and its two buttons as described above. Keep print styles
  unaffected (the toolbar is hidden when printing; check `base.css`).
- [x] **4.** Nothing else in the toolbar moves: compare the x position of the Export and theme
  buttons before and after (read `getBoundingClientRect().left` for each) and report the shift.
  A shift equal to the caret's width is expected.

## Verify

- [x] `pnpm test` (287 → 291 tests), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Manual check on a scratch copy of `fixtures/gfm.md`, **both themes**: Done by supervisor.
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
- [x] Commit: `Make Save a split button: click saves, caret opens Save as`.

## Report

- **Tests:** 287 → 291 (4 new SaveMenu tests added).
- **Stub calls and manual check:** Done by supervisor.
- **x-shift measurement:** Done by supervisor (Task 4).
- **Divider token:** `var(--chrome-border)` (already used in toolbar; defined in `app-theme.css`).
- **Files changed:**
  - `src/components/Toolbar/SaveMenu.tsx`: Split button implementation with disk button (saves immediately) and caret button (opens menu).
  - `src/components/Toolbar/Toolbar.css`: Added `.toolbar__split` and `.toolbar__split-caret` styles for the split-button appearance.
  - `src/components/Toolbar/SaveMenu.test.tsx`: New component test with 4 tests covering disk/caret button interactions and disabled state.
  - `docs/plans/review-followups/phase-07-save-split-button.md`: This document (checkboxes and report).
- **Notes:** Disk button now saves immediately with `onClick={() => void save()}`. Caret button has `aria-label="More save options"`, `aria-haspopup="menu"`, and `aria-expanded`. Menu aligns to left (via `style={{ left: 0 }}`). Escape in menu returns focus to caret button. Both buttons disabled when `hasDocument` is false. ChevronDown icon at size 12 with shared stroke props.

## Supervisor check

**Layout bug found in the app and fixed (follow-up commit):** `.toolbar__split` wasn't a
positioning container (`position` unset, plus `overflow: hidden`), and the menu got `left: 0` from an
inline style while the stylesheet already sets `right: 0`. Measured in the app: the Save menu spanned
the whole toolbar, x 0–1646 px, from the window's left edge. The jsdom tests couldn't catch this.
Fix: `position: relative` on `.toolbar__split`, no `overflow: hidden`, no inline style. Aligning the
menu to the disk button's left edge (as planned) made it run 28 px past the window's right edge, since
the button sits near the right of the toolbar, so the menu keeps the toolbar's right-aligned
dropdown like the Export menu: now x 1346–1536, just under the split button.

**Task 4:** Export, Theme and Settings are at exactly the same x as before (1542, 1576, 1610); the
Save group starts 24 px further left (1508 → 1484) to make room for the caret.

**Manual check (supervisor, scratch gfm.md):** with `save`/`saveAs` stubbed, the disk button called
`save` once and didn't open the menu; the caret opened it; "Save as…" called `saveAs` once and closed
it. Screenshots in dark and light (crops of the toolbar): disk half hovered has rounded left corners
and a square right edge; caret half hovered is the reverse; with the menu open the caret turns the
accent colour and the menu sits under the split. The 1px `--chrome-border` divider is faint but
present. Settings equal to the backup at the end. `pnpm test` 291 passed; lint, tsc clean.
