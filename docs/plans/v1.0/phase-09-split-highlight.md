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

- [x] `pnpm test` (the count before and after), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Dev app with a copy of `fixtures/gfm.md` in Split view. With the setting off (the default), no
  highlight. Turn it on (`{ persist: false }` from eval, then also through the Settings toggle with a
  real click, restoring the key afterwards), move the cursor through a paragraph, a list item, a
  table and a code block, and the band spans the whole pane with square corners. Screenshots in
  **light and dark**, with the source on the left and on the right. Open each one and describe it.
- [x] Print preview (`node scripts/cdp.mjs pdf <scratch.pdf>`) has no band.
- [x] Commit: `Make the Split view cursor highlight full-width and optional`.

## Report

**What changed**
- `src/store/settings.ts`: new `splitCursorMirror: boolean`, default `false`, in `Settings` and `DEFAULTS`
  (persisted like the other booleans).
- `src/components/Split/SplitView.tsx`: `useCursorMirror` is now exported (so it can be tested) and reads
  the setting. Off: the effect returns before any DOM read or write. Turning it off clears the tint at once
  (its own effect). Clearing is one `clearMarks` helper, also used on unmount. For a table row the hook
  also puts `is-cursor-table` on the table, but only when the table has nothing to scroll
  (`scrollWidth <= clientWidth`); see the table note below.
- `src/components/Preview/Preview.css`: the band is `background` plus `box-shadow: 0 0 0 100vmax` and
  `clip-path: inset(0 -100vmax)`: no padding or margin change, square corners, same tint token
  (`--md-cursor-block`, 7% of `--md-text`, both themes). The old 4px ring and radius are gone.
- `src/styles/base.css`: `@media print` also resets `clip-path`, the table clip override and the row
  pseudo-elements.
- `src/components/Settings/GeneralTab.tsx`: toggle "Highlight the cursor's block in Split view" (hint "Tints
  the formatted block you're editing") right after *Split layout*.
- `src-tauri/resources/guide/Guide.md` (Views section and Settings reference table) and `README.md` (Split
  bullet) describe the highlight, that it is off by default, and the setting's name.

**Table rows need special handling (not in the plan).** The preview's `table` is `display: block;
overflow: auto`, which clips anything a row or cell paints outside it, and a box shadow on a collapsed table
cell does not paint outside the cell at all (tried, then confirmed with `overflow: visible`). What works: the
first and last cell of the marked row get a zero-width `::before` / `::after` carrying an offset shadow
(a real box there widened the pane's scrollable area and showed a horizontal scrollbar; I saw it and fixed it),
and the table gets `overflow: clip; overflow-clip-margin: 100vmax` while it holds the marked row. That would
stop a table wider than its column from scrolling while the cursor is in it, so the hook only adds
`is-cursor-table` when nothing needs scrolling. A table wider than its column therefore keeps its scrolling and
its row band stops at the table's edges. I did not build a wide-table fixture to look at that case; it follows
from the `scrollWidth <= clientWidth` test.

**Tests** (`pnpm test`: 698 before, 707 after; nothing deleted or weakened, no existing test needed changing)
- `settings.test.ts`: default `false`, `set` updates it. `settings.persist.test.ts`: written to disk.
- `GeneralTab.test.tsx`: the toggle exists with its label and hint, and clicking it sets the key.
- New `SplitView.test.tsx` (no SplitView test existed): the setting is off by default; off, nothing is marked
  and `querySelector` is never called; on, the innermost block is marked as the cursor moves and nothing on a
  blank line; turning it on/off shows/clears the tint immediately; a table row marks its table and lets go
  when the cursor leaves.

**Verified in the dev app** (copy of `gfm.md`, Split view, own WebView2 folder)
- Default (key absent from `settings.json`): `splitCursorMirror` false; cursor on lines 7, 18, 32, 39 marks
  nothing.
- On via `{ persist: false }`: cursor in a paragraph (7), a nested list item (18), a table row (31/32), a fenced
  code block (39), a blank line (13, nothing marked). Computed style on the paragraph/list/code: radius 0px,
  `box-shadow ... 0 0 0 1100px` (100vmax of the 1100px window), `clip-path: inset(0 -1100px)`.
- Screenshots opened and described, both themes and both pane orders (`dark-L-*.png`, `dark-R-*.png`,
  `light-L-*.png`, `light-R-*.png` in the scratchpad's `p9` folder; dark and light files have different
  hashes). Dark, source left: the paragraph band runs from the divider to the pane's scrollbar, square
  corners, not over the source pane or outline; the nested list item's band covers its bullet; the code
  block's band shows either side of the block's own darker background; the table row's band runs edge to edge
  through the table. Dark, source right: the band runs from the outline's edge to the divider, both edges
  exact. Light: same shapes with a light-grey tint (table row with source left; code block and list item with
  source right).
- After the fix, `preview-scroll` had no horizontal overflow for lines 7, 18, 31, 39, 13, 3 and 60.
- Formatted-only view: no `is-cursor-block` or `is-cursor-table`, with *Full width* both on and off. Back to
  Split: marked again. Setting turned off in memory: both classes gone at once.
- Settings toggle with real mouse events (`Input.dispatchMouseEvent`): clicking it flipped the store and the
  key on disk (true, then false), and the band appeared and disappeared. Left at `false`.
- Print: with print media emulated, the marked paragraph and table row compute to no background, no shadow,
  no clip-path, no pseudo-element content, table `overflow: auto`. `node scripts/cdp.mjs pdf` saved a PDF, but
  pdftoppm is not installed, so I could not look at its pages: the print check is by computed style only.

**Commands:** `pnpm test` 707 pass, `pnpm lint` clean, `npx tsc --noEmit` clean, `pnpm format` run (only my
files changed). Rust untouched; `cargo build` ran fine for the dev exe.

**Housekeeping.** In `%APPDATA%\com.bilal.markdown-viewer`, `presets.json` and `.window-state.json` are
unchanged (hash-compared). `settings.json` was compared by value with the backup: only `recentFiles` (my fixture
had been added) and the new `splitCursorMirror` key differed; `recentFiles` is restored and is exactly Bilal's
two entries (`...remediation-plan.md`, then `...codebase-audit.md`), and `splitCursorMirror` is `false`.
Bilal's installed app was not running. I stopped only PIDs I started (dev exe 10900, Vite node 17004, each
confirmed by command line); the first dev exe (6940) was closed by a mis-aimed click of mine on the window's
Close button, and I relaunched. One slip: my first backup went into the shared scratchpad's existing `backup`
folder and overwrote same-named files (`settings.json`, `presets.json`, `.window-state.json`) that an earlier
phase had left there; they were only backups, and my real backup for this phase is in `p9\backup`.

**Follow-ups:** none in scope. The tint uses `--md-text` at 7% while the editor's active line uses
`--content-fg` at 7%; they match in the built-in presets but could differ in a preset with unusual text colours.

## Supervisor check

_(supervisor fills in)_
