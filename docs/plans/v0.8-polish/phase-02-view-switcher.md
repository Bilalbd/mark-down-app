# Phase 2: Icon view-mode switcher

The Formatted / Source / Split switcher is a row of text buttons that doesn't line up with the
28 px icon buttons around it. Replace the labels with icons (Bilal's choice: **Eye**, **Code**,
**Columns2**), tidy the padding and alignment, and style the active segment like the other toolbar
toggles (accent-coloured icon).

## Files

- `src/components/Toolbar/Toolbar.tsx`
- `src/components/Toolbar/Toolbar.css`
- `src/components/Toolbar/Toolbar.test.tsx` (new)

No README change (the shortcuts don't change).

## Tasks

- [ ] **1.** `VIEW_MODES` gets an `icon` field: `Eye` for formatted, `Code` for source, `Columns2`
  for split (all from `lucide-react`). Render `<m.icon {...ICON} />` instead of the label. Each
  button keeps `title` (e.g. `Formatted view (Ctrl+E)`), gets `aria-label` with the view name
  (`Formatted view`, `Source view`, `Split view`) and keeps `aria-pressed`.
- [ ] **2.** CSS, tokens only:
  - `.toolbar__segment`: height 28 px (same as `.toolbar__btn`), `padding: 2px`, `gap: 2px`,
    `border-radius: 6px`, `background: var(--chrome-inset)`, `align-items: center`.
  - `.toolbar__seg`: 24 × 30 px, `display: grid; place-items: center`, `border-radius: 4px`,
    `color: var(--chrome-fg-muted)`; hover: `color: var(--chrome-fg)`.
  - `.toolbar__seg.is-active`: `background: var(--chrome-bg)`, `color: var(--accent)`,
    `box-shadow: 0 0 0 1px var(--chrome-border)`.
  - `.toolbar__seg:focus-visible`: a visible focus ring consistent with the rest of the toolbar
    (check how other toolbar buttons show focus and match it).
- [ ] **3.** The switcher sits vertically centred with the outline button to its left and the
  swap/full-width button to its right, with the toolbar's normal 6 px gap.
- [ ] **4.** `Toolbar.test.tsx`: renders three buttons with the aria-labels above; the one for the
  current `viewMode` has `aria-pressed="true"` and the others `false`; clicking the Source button
  sets `viewMode` to `source` in the settings store. Mock `@/lib/tauri` and the Tauri plugins at
  the boundary as the other component tests do.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check in **light and dark**, once per view mode (Formatted, Source, Split). Crop and
  enlarge the left part of the toolbar: the three icons are evenly spaced and centred, the active one
  is a raised chip with an accent icon, and the group lines up with the neighbouring buttons.
  Ctrl+E and Ctrl+Shift+E still switch views and the active chip follows.
- [ ] Commit: `Use icons in the view mode switcher`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
