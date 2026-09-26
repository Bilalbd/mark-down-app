# Phase 3: Centre the view-mode highlight, theme the scrollbars

**Goal:** (a) the highlighted Formatted / Source / Split button looks evenly inset on all four
sides. (b) All scrollbars in the app are slim and rounded, and take their colours from the theme.

Read `docs/plans/save-recent-polish/README.md` (decisions and rules) first, then
`src/components/Toolbar/Toolbar.css` (`.toolbar__segment`, `.toolbar__seg`, `.is-active`),
`src/styles/base.css`, `src/styles/app-theme.css` (tokens), `src/components/Tabs/TabStrip.css`
(the tab list hides its scrollbar on purpose; keep that) and `src/components/Editor/SourceEditor.css`.

## What the supervisor already measured

The layout is already even: the active button sits exactly 2px from the group's edge on all four
sides. Two things make it **look** uneven:
1. The active button has `box-shadow: 0 1px 2px rgba(0,0,0,0.15)`, a shadow pushed 1px down, so the
   bottom looks heavier than the top.
2. The display is scaled 144%, and the toolbar sits on a fractional pixel position (its top is at
   about 37.71 CSS px), so a 2px gap renders as 2 or 3 real pixels depending on the edge.

## Files

- `src/components/Toolbar/Toolbar.css`
- `src/styles/base.css` (scrollbars; global rules live here per CLAUDE.md)

## Tasks

### A. View-mode highlight

- [ ] **A1.** Replace the offset shadow on `.toolbar__seg.is-active` with one that is the same on
  every side: `box-shadow: 0 0 0 1px var(--chrome-border);` (a hairline outline in the theme's border
  colour) instead of the downward shadow.
- [ ] **A2.** Find out where the fractional pixel position comes from (the title bar is 32px and the
  toolbar 40px, so something in between isn't a whole number: check `getBoundingClientRect()` of
  `.titlebar`, `.toolbar` and `.toolbar__segment`, and any `border`, `height` or `padding` with
  fractional values in between). If you can make the toolbar start on a whole CSS pixel with a
  small, clearly correct change (for example a height that doesn't add up), do it and explain it.
  If the fraction only comes from Windows' 144% scaling (32 × 1.44 isn't whole), leave it and say
  so; A1 is then the fix.
- [ ] **A3.** Hover state of inactive buttons: keep it as it is.

### B. Scrollbars

- [ ] **B1.** In `base.css`, add a global, token-based scrollbar style. Use **only** the
  `::-webkit-scrollbar` pseudo-elements: in current Chromium/WebView2, setting the standard
  `scrollbar-color` / `scrollbar-width` properties on an element **disables** its `::-webkit-scrollbar`
  styling, so don't add those two here.
  ```css
  /* Slim, theme-coloured scrollbars (WebView2 / Chromium). */
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--chrome-fg-muted) 35%, transparent);
    border-radius: 5px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--chrome-fg-muted) 60%, transparent); background-clip: padding-box; }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; }
  ```
  `--chrome-fg-muted` is set from the active preset (`chromeCss.ts`), so the thumb follows the preset
  in both themes. Check that nothing else in the app already sets `scrollbar-color` or
  `scrollbar-width` on a scrolling area (grep `src/`). The tab list's `scrollbar-width: none` is
  intentional (hidden scrollbar) and stays.
- [ ] **B2.** The source editor (`.cm-scroller`), the preview (`.preview-scroll`), the outline, the
  settings panel and Split view panes must all show the new scrollbar. Check each in the app.
- [ ] **B3.** Print: `@media print` must not show scrollbars. It shouldn't, because printing
  doesn't render them, but check `base.css`'s print block for anything relevant.

## Verify

- [ ] `pnpm test` (211+), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check with `fixtures\huge.md` (long enough to scroll):
  1. Crop and enlarge the view-mode group (in dark and light) **before** and **after** your change,
     from screenshots. Read them and describe the gaps around the highlighted button. Also read back
     the computed `box-shadow` of `.toolbar__seg.is-active`.
  2. Screenshots in dark and light of Formatted view (preview scrollbar) and Source view (editor
     scrollbar), each cropped to the right-hand scrollbar, **and** one with the outline showing
     enough headings to scroll (huge.md should). Describe the thumb colour, width and roundness.
  3. Switch to a second preset (`__mdv.style.setState({ activePresetId: 'builtin-nord' })`), take a
     dark screenshot, and confirm the thumb colour changed with the preset. Put the preset back.
  4. Put the theme back and stop the app.
- [ ] Commit: `Centre the view-mode highlight and theme the scrollbars`.

## Report

_(Fill in: A2 finding, outputs, screenshot paths, anything that differed.)_
