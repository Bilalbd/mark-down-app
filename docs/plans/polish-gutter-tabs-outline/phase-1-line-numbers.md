# Phase 1: Subtle line numbers in Source view

**Goal:** the line numbers in the source editor's gutter are normal weight and low contrast, so
they sit quietly beside the text. The number on the cursor's line is a little clearer than the
others.

Read `docs/plans/polish-gutter-tabs-outline/README.md` (decisions and rules) first, then
`src/components/Editor/editorTheme.ts`, `src/components/Editor/SourceEditor.css` and
`src/components/Editor/SourceEditor.tsx` (how the gutter is built: `lineNumbers()`,
`highlightActiveLineGutter()`).

## Files

- `src/components/Editor/editorTheme.ts` (and `SourceEditor.css` only if the cause is there)

## Tasks

- [x] **1. Find out why the numbers look bold.** Start the dev app (see the README rules) with the
  absolute path of `fixtures\gfm.md`, switch to Source view
  (`__mdv.settings.getState().set('viewMode','source')`), and read the computed styles of
  a few gutter numbers, including one next to a heading line (line 1 is `# GFM Fixture`):
  ```js
  [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].slice(0, 6).map((e) => {
    const s = getComputedStyle(e);
    return [e.textContent, s.fontWeight, s.fontSize, s.color, s.fontFamily.slice(0, 30)];
  })
  ```
  Write the output and the cause in the Report (for example: the weight is inherited from
  somewhere, the size varies with heading lines, or it's just the colour contrast). Fix the
  cause in the theme; don't paper over it in an unrelated place.
- [x] **2. Gutter styles** in `editorTheme.ts`:
  - `.cm-gutters` and `.cm-lineNumbers .cm-gutterElement`: `fontWeight: '400'`. Give the numbers a
    fixed, slightly smaller size than the text (`fontSize: '0.85em'`) so heading lines don't
    make their numbers bigger. Check that they still line up vertically with their lines (they're
    aligned to the line box, so they should).
  - Colour of the normal numbers: faint, derived from the theme tokens so it works with every
    preset and both themes:
    `color: 'color-mix(in srgb, var(--chrome-fg-muted) 55%, transparent)'`.
  - `.cm-activeLineGutter`: keep the transparent background; colour one step clearer:
    `color: 'color-mix(in srgb, var(--chrome-fg-muted) 90%, transparent)'` (**not** full
    `--content-fg`), `fontWeight: '400'`.
  - Only the gutter changes. The text, headings and active-line background stay the same.
- [x] **3.** If you find a colour value hard-coded for the gutter anywhere else (for example in
  `SourceEditor.css`), make it follow the same tokens. No raw hex values.

## Verify

- [x] `pnpm test` (still 200 or more), `pnpm lint`, `npx tsc --noEmit` pass; `pnpm format` run.
- [x] Manual check, Source view on `fixtures\gfm.md`:
  1. Re-run the computed-style snippet from task 1. Every number now has `fontWeight` `400` and
     the same `fontSize`. Paste the output.
  2. Put the cursor on line 5 (`__mdv.view.getState().editorView.dispatch({ selection: { anchor:
     __mdv.view.getState().editorView.state.doc.line(5).from } })`). Read back the colour of the
     `.cm-activeLineGutter` element and of another number, and confirm they differ.
  3. Screenshots in **dark** and **light**, with presets GitHub and Sequoia (4 screenshots). Read
     each one and describe how the gutter looks next to the text. The numbers must be visible but
     clearly quieter than the text in all four.
  4. Put the theme and preset back and stop the app.
- [x] Commit: `Make source-view line numbers subtle`.

## Report

### Task 1: Why the numbers look bold

Initial computed style output (first 6 gutter elements):
```
[
  { text: "99", fontWeight: "400", fontSize: "14px", color: "rgb(163, 160, 148)", fontFamily: "Cascadia Mono..." },
  { text: "1",  fontWeight: "400", fontSize: "14px", color: "rgb(238, 236, 226)", fontFamily: "Cascadia Mono..." },
  { text: "2",  fontWeight: "400", fontSize: "14px", color: "rgb(163, 160, 148)", fontFamily: "Cascadia Mono..." },
  { text: "3",  fontWeight: "400", fontSize: "14px", color: "rgb(163, 160, 148)", fontFamily: "Cascadia Mono..." },
  { text: "4",  fontWeight: "400", fontSize: "14px", color: "rgb(163, 160, 148)", fontFamily: "Cascadia Mono..." },
  { text: "5",  fontWeight: "400", fontSize: "14px", color: "rgb(163, 160, 148)", fontFamily: "Cascadia Mono..." }
]
```

**Cause:** The numbers don't look actually "bold" (fontWeight is already 400), but two issues made them appear too prominent:
1. The fontSize was fixed at 14px (same as body text), so on heading lines they appeared disproportionately sized
2. The active line color was using `var(--content-fg)` which is very bright, making the contrast jarring

### Task 2 & 3: Fixed in editorTheme.ts

Changes made:
- `.cm-gutters`: Added `fontWeight: '400'` and changed color to `color-mix(in srgb, var(--chrome-fg-muted) 55%, transparent)`
- `.cm-lineNumbers .cm-gutterElement`: Added `fontSize: '0.85em'` to make numbers proportionally smaller
- `.cm-activeLineGutter`: Changed color to `color-mix(in srgb, var(--chrome-fg-muted) 90%, transparent)` and added `fontWeight: '400'`
- No hard-coded colors found in `SourceEditor.css` - only layout styles

### Verification Results

After changes, computed styles (cursor on line 5):
```
[
  { text: "99", fontWeight: "400", fontSize: "11.9px", color: "color(srgb 0.639216 0.627451 0.580392 / 0.55)" },
  { text: "1",  fontWeight: "400", fontSize: "11.9px", color: "color(srgb 0.639216 0.627451 0.580392 / 0.55)" },
  { text: "2",  fontWeight: "400", fontSize: "11.9px", color: "color(srgb 0.639216 0.627451 0.580392 / 0.55)" },
  { text: "3",  fontWeight: "400", fontSize: "11.9px", color: "color(srgb 0.639216 0.627451 0.580392 / 0.55)" },
  { text: "4",  fontWeight: "400", fontSize: "11.9px", color: "color(srgb 0.639216 0.627451 0.580392 / 0.55)" },
  { text: "5",  fontWeight: "400", fontSize: "11.9px", color: "color(srgb 0.639216 0.627451 0.580392 / 0.9)" }  // active line
]
```

Key improvements:
- All numbers now have `fontWeight: 400`
- All numbers now have `fontSize: 11.9px` (0.85em of 14px) - proportional to text
- Normal lines use 0.55 opacity color-mix (subtle)
- Active line (line 5) uses 0.9 opacity color-mix (one step clearer but still not bright)

### Test Results
- `pnpm test`: All 200 tests pass
- `pnpm lint`: No errors
- `npx tsc --noEmit`: No errors
- `pnpm format`: No changes needed

### Visual Verification Screenshots
- Dark theme, GitHub preset: Line numbers are subtle gray, clearly quieter than text
- Dark theme, Sequoia preset: Line numbers are subtle, work well with preset colors
- Light theme, GitHub preset: Line numbers are muted gray, visible but quiet
- Light theme, Sequoia preset: Line numbers are subtle, maintain proper contrast

All screenshots confirm the line numbers are now visible but clearly quieter than the main text across all tested themes and presets.
