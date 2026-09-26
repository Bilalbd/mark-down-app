# Phase 2: Chrome-style tabs

**Goal:** the tab strip looks like Google Chrome's. The title bar is a shade darker than the
toolbar. The active tab has rounded top corners, starts a few pixels below the top of the window,
and has the toolbar's colour, so it looks joined to the toolbar below it. Inactive tabs are flat,
with thin separators, and get a rounded highlight on hover.

Read `docs/plans/polish-gutter-tabs-outline/README.md` (decisions and rules) first, then
`src/components/Tabs/TabStrip.tsx` + `TabStrip.css`, `src/components/TitleBar/TitleBar.tsx` +
`TitleBar.css`, `src/components/Toolbar/Toolbar.css`, `src/styles/app-theme.css` (the `--chrome-*`
tokens) and `src/styles/chromeCss.ts` (which derives the chrome tokens from the active preset;
every chrome token has to be set in **both** places).

## Files

- `src/styles/app-theme.css`, `src/styles/chromeCss.ts` (a new token)
- `src/components/TitleBar/TitleBar.css`
- `src/components/Tabs/TabStrip.css` (and `TabStrip.tsx` only if a class is needed)
- Maybe `src/components/Toolbar/Toolbar.css` (see task 4)

## Tasks

- [ ] **1. New token `--chrome-titlebar-bg`**, a shade darker than `--chrome-bg`:
  - `app-theme.css`: light `#e8e8e8`, dark `#161616` (next to `--chrome-bg` in both theme blocks).
  - `chromeCss.ts`: add
    `--chrome-titlebar-bg: ${theme === 'dark' ? \`color-mix(in srgb, #000 35%, ${mix(5)})\` : mix(10)};`
    right after `--chrome-bg`. Update the function's JSDoc if it lists the tokens. If there's a
    test for `presetToChromeCss`, add an expectation for the new token; if there isn't, add
    `src/styles/chromeCss.test.ts` with one test per theme that checks the token is present.
- [ ] **2. Title bar background.** In `TitleBar.css`, `.titlebar` uses
  `background: var(--chrome-titlebar-bg);`. The window-control buttons stay as they are (their
  hover colours still work on the darker bar; check the close button's red hover).
- [ ] **3. Tab shape** in `TabStrip.css`:
  - `.tabstrip`: tabs start below the top. Give it `padding-top: 6px` (keep its height at 100% of
    the title bar) and `align-items: stretch`, so each tab is `var(--titlebar-height)` minus 6px tall
    and touches the bottom of the title bar.
  - `.tabstrip__tab`: `border-radius: 8px 8px 0 0; position: relative;` Remove the
    `border-right` and the accent `box-shadow` underline. Keep width, min-width, padding, font and
    colours otherwise.
  - Active tab (`.is-active`): `background: var(--chrome-bg); color: var(--chrome-fg);`, the same
    colour as the toolbar, so it merges into it.
  - Chrome's outward curves at the bottom of the active tab (optional but wanted): add
    `::before` and `::after` on `.tabstrip__tab.is-active`, each 8×8px, absolutely positioned at
    the bottom-left (`left: -8px`) and bottom-right (`right: -8px`), painted with
    `radial-gradient(circle at 0 0, transparent 8px, var(--chrome-bg) 8.5px)` (left one) and
    `radial-gradient(circle at 100% 0, transparent 8px, var(--chrome-bg) 8.5px)` (right one).
    Mirror them correctly; check the screenshot. If they look wrong after two tries, drop them
    and say so in the Report.
  - Inactive tab hover: Chrome shows a rounded pill that stops a little above the bottom edge.
    Draw it with a `::before` on inactive tabs (only the active tab uses `::before` for a curve,
    so there's no clash):
    ```css
    .tabstrip__tab { isolation: isolate; } /* so z-index: -1 stays inside the tab */
    .tabstrip__tab:not(.is-active)::before {
      content: '';
      position: absolute;
      inset: 0 2px 4px;
      border-radius: 8px;
      z-index: -1;
    }
    .tabstrip__tab:not(.is-active):hover::before { background: var(--chrome-hover); }
    ```
    Remove the old `.tabstrip__tab:hover { background: … }` rule.
  - Separators: a 1px × 16px vertical line (`var(--chrome-border)`) between inactive tabs,
    drawn with `::after` on each inactive tab at its right edge, vertically centred. Hide it on
    the tab just before the active tab, on the active tab, and while hovering (use a
    `.is-before-active` class set in `TabStrip.tsx` if CSS alone can't do it).
  - The close button: round (`border-radius: 50%`), 18×18px. The dirty dot and the close/dot swap
    behaviour stay as they are.
  - `.tabstrip__new` (+) and the `.tabstrip__menu` dropdown: the + becomes a 28×28px round
    button, vertically centred in the tab row, with the same hover colour. The dropdown must still
    open below it and not be clipped.
- [ ] **4. Joined to the toolbar.** The active tab and the toolbar must look like one surface: no
  line between them under the active tab. Check `Toolbar.css` and `TitleBar.css` for a
  `border-top` / `border-bottom` between them. If there is one, remove it only where it would
  separate the active tab from the toolbar (Chrome has no line there at all, so removing it
  completely is fine).
- [ ] **5. Drag region.** The empty title-bar area right of the tabs must still carry
  `data-tauri-drag-region`, and the tabs must not. Check with a DOM query; don't change the
  markup unless task 3 needs a class.
- [ ] **6. Window mode.** When the tab strip is hidden (the "Open files in: New window" setting
  with one tab), the title bar shows the old "Markdown – file" text. It must still look right
  on the darker title bar.

## Verify

- [ ] `pnpm test` (200 or more), `pnpm lint`, `npx tsc --noEmit` pass; `pnpm format` run.
- [ ] Manual check with `fixtures\gfm.md` plus two more tabs
  (`__mdv.tabs.getState().openInTab('<abs path of fixtures\\math.md>')` and `mermaid.md`, in an
  eval-file script):
  1. Read back computed styles: `.titlebar` background vs `.toolbar` background (they differ);
     the active tab's background (equals the toolbar's); the active tab's
     `getBoundingClientRect().top` (a few px, not 0) and its `border-top-left-radius` (`8px`).
  2. Screenshots, each **cropped to the top ~120px** of the window if you can (otherwise the full
     window is fine), in **dark** and **light**, with presets GitHub and Sequoia (4
     screenshots). Also one while hovering an inactive tab: you can't hover through CDP, so add
     the hover styling temporarily by giving that tab an inline style copy in devtools, or skip it
     and say so. Read each screenshot and describe the shape, the join to the toolbar, the
     separators and the curves.
  3. Window mode: `set('openFilesIn','window')` after closing the extra tabs → screenshot of the
     plain title. Then set it back to `'tab'`.
  4. Put theme, preset and `openFilesIn` back and stop the app.
- [ ] Commit: `Give tabs a Chrome-style shape joined to the toolbar`.

## Report

_(Fill in: the verify outputs, the screenshot paths, how you did the hover pill, whether the curves
stayed in.)_
