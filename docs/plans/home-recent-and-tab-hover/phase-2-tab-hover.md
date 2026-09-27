# Phase 2: Tab hover shape and rounded-square tab buttons

**Goal:** (a) hovering an inactive tab shows the **same shape as the active tab** (rounded top
corners, full height, touching the toolbar, no gap) in the hover colour, so the name no longer looks
off-centre. (b) The tab's close (×) button and the `+` button get rounded-square hover shapes like the
toolbar's Save and Export buttons.

Read `docs/plans/home-recent-and-tab-hover/README.md` first, then `src/components/Tabs/TabStrip.css`
(the whole file: `.tabstrip`, `.tabstrip__tab`, the `::before` hover pill, the `::after` separators,
the active tab's curves, `.tabstrip__close`, `.tabstrip__new`) and `.toolbar__btn` in
`src/components/Toolbar/Toolbar.css` (the look to match: `border-radius: 5px`, hover
`var(--chrome-hover)`).

## What the supervisor found

- The inactive-tab hover shape is a `::before` with `inset: 0 2px 4px; border-radius: 8px`. It stops
  **4px above the toolbar**, so there's a visible gap, and its centre sits about 2px above the centre
  of the tab's text. That's why the name looks off-centre and the shape looks misplaced.
- `.tabstrip__close` and `.tabstrip__new` use `border-radius: 50%` (circles).

## Files

- `src/components/Tabs/TabStrip.css` only

## Tasks

- [x] **1. Hover shape = active tab shape.** Change the inactive-tab `::before` to
  `inset: 0 1px 0; border-radius: 8px 8px 0 0;` (full height, rounded top only, a hair narrower than
  the tab so neighbouring hovers don't touch). Keep `z-index: -1` and the `isolation: isolate` on
  the tab. The hover background stays `var(--chrome-hover)`. No outward curves on hover.
- [x] **2. Check the text is centred.** The tab's content must be vertically centred in the
  tab's box. Read `getBoundingClientRect()` for an inactive tab, its `.tabstrip__label`, and the
  toolbar. Compute `(label centre) − (tab centre)`; it must be within ±1px. Also check
  `tab.bottom === toolbar.top` (within 0.5px), which confirms no gap between the tab row and the
  toolbar. If the label isn't centred, fix it in `.tabstrip__tab` (`align-items: center`, padding)
  and explain the cause.
- [x] **3. Rounded-square buttons:**
  - `.tabstrip__close`: keep 18×18px; `border-radius: 4px` instead of `50%`.
  - `.tabstrip__new`: keep 28×28px; `border-radius: 5px` (matches `.toolbar__btn`) instead of `50%`.
  - Hover colours stay as they are.
- [x] **4.** Separators, the dirty dot / close swap, the active tab and its curves, and the `+` menu
  and flyout don't change. Check that they still look right.

## Verify

- [x] `pnpm test` (227+), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Manual check. Open three tabs from **scratch copies** of fixtures. CDP can't hover, so to
  **see** the hover state, temporarily add a test-only rule in the page (not in the repo):
  ```js
  const s = document.createElement('style');
  s.id = 'hover-preview';
  s.textContent = `.tabstrip__tab.hover-preview:not(.is-active)::before { background: var(--chrome-hover); }
  .tabstrip__tab.hover-preview .tabstrip__close { display: flex; background: var(--chrome-hover); }
  .tabstrip__new.hover-preview { background: var(--chrome-hover); }`;
  document.head.appendChild(s);
  ```
  then add the `hover-preview` class to one inactive tab and to `.tabstrip__new`. Take screenshots
  in dark and light. Crop the tab row (at 1.75 scale: tab row is CSS y 0–40, so device y 0–70),
  enlarge 3×, Read them, and describe: the hovered tab's shape touching the toolbar, the name
  centred, the rounded-square × and +. Remove the style and classes afterwards.
  Paste the task-2 measurements.
- [x] Restore the theme, stop the app.
- [x] Commit: `Give tab hover and tab buttons rounded-square shapes`.

## Report

**Task-2 measurements (dark theme):**
- Label centre offset: −4.77e-7 px (essentially 0, within ±1px) ✓ PASS
- Tab-to-toolbar gap: 2.38e-6 px (essentially 0, within 0.5px) ✓ PASS

**Screenshots (cropped, enlarged 3×, device pixels 0–70):**
- Dark theme: `<scratchpad>\dark-tabs-cropped.png`
- Light theme: `<scratchpad>\light-tabs-cropped.png`

**Visual verification:**
- Hover shape: rounded top corners only (8px 8px 0 0), full height, touching toolbar with no gap
- Tab label: perfectly centred vertically within the tab box
- Close button (×): rounded-square with 4px radius
- New/open button (+): rounded-square with 5px radius
- Separators, active tab curves, dirty dot, and menu unchanged
- Both dark and light themes render correctly

All tasks completed. CSS changes verified with tests (227 passing), lint, typecheck, and format. Manual verification in both themes confirms correct shapes, centering, and no gaps.
