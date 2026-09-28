# Phase 9: Split view cursor highlight: full-width band, and a setting (off by default)

Bilal's request (2026-09-28): in Split view, the highlight on the formatted pane's block that holds
the editor cursor (v0.8 Phase 4, `is-cursor-block` in `src/components/Split/SplitView.tsx`) should
look like the source editor's active line: **the full width of the pane, no rounded corners**. And
the feature should be **optional**, a setting that's **off by default**.

## Behaviour

- The band spans the whole formatted pane from edge to edge (like the editor's active line spans the
  editor), not just the preset's content column, and has **square corners**. Same tint as today (the
  editor's active-line strength); both themes.
- It must not shift the layout: no padding or margin changes on the block. The usual way is a
  horizontally unbounded background, for example `box-shadow: 0 0 0 100vmax <tint>` with
  `clip-path: inset(0 -100vmax)`, or a positioned pseudo-element. Check that it isn't clipped by the
  preview's scroll container and doesn't cover the outline or the other pane.
- It still follows the cursor as it does today, in both pane orders (source left or right).
- **New setting** `splitCursorMirror: boolean`, default **`false`**, in `Settings` and `DEFAULTS`.
  When off, no block gets `is-cursor-block`, and the effect does no DOM work at all. When turned on
  or off, the highlight appears or disappears straight away.
- Settings UI: for now, a toggle in Settings → General next to *Split layout*, labelled **"Highlight
  the cursor's block in Split view"** with the hint *"Tints the formatted block you're editing"*.
  (Phase 10 moves it into the new *Layout* card.)
- Keep print output clean: no highlight when printing (check `@media print`).
- Colours through tokens only (the existing `--md-*` / `--content-*` variables), no raw hex in
  component CSS.

## Files

`src/components/Split/SplitView.tsx`, the CSS that styles `.is-cursor-block` (find it; probably
`Preview.css`), `src/store/settings.ts` (+ tests), `src/components/Settings/GeneralTab.tsx` (+ test),
`src-tauri/resources/guide/Guide.md` (the Views section and the Settings reference table),
`README.md` (the Split bullet).

## Tests

- Settings key and default (`false`), persistence like the other booleans.
- `SplitView` test (or the closest existing one): with the setting off, no element gets
  `is-cursor-block` when the cursor moves; with it on, the right element does. If `SplitView` has no
  test harness yet, test the pure part (which block matches a cursor line) in a helper and explain.

## Verify

- [ ] `pnpm test` (the count before and after), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Dev app with a copy of `fixtures/gfm.md` in Split view. With the setting off (the default), no
  highlight. Turn it on (`{ persist: false }` from eval, then also through the Settings toggle with a
  real click, restoring the key afterwards), move the cursor through a paragraph, a list item, a
  table and a code block, and the band spans the whole pane with square corners. Screenshots in
  **light and dark**, with the source on the left and on the right. Open each one and describe it.
- [ ] Print preview (`node scripts/cdp.mjs pdf <scratch.pdf>`) has no band.
- [ ] Commit: `Make the Split view cursor highlight full-width and optional`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
