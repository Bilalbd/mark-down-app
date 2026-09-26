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

- [x] **1. New token `--chrome-titlebar-bg`**, a shade darker than `--chrome-bg`:
  - `app-theme.css`: light `#e8e8e8`, dark `#161616` (next to `--chrome-bg` in both theme blocks).
  - `chromeCss.ts`: add
    `--chrome-titlebar-bg: ${theme === 'dark' ? \`color-mix(in srgb, #000 35%, ${mix(5)})\` : mix(10)};`
    right after `--chrome-bg`. Update the function's JSDoc if it lists the tokens. If there's a
    test for `presetToChromeCss`, add an expectation for the new token; if there isn't, add
    `src/styles/chromeCss.test.ts` with one test per theme that checks the token is present.
- [x] **2. Title bar background.** In `TitleBar.css`, `.titlebar` uses
  `background: var(--chrome-titlebar-bg);`. The window-control buttons stay as they are (their
  hover colours still work on the darker bar; check the close button's red hover).
- [x] **3. Tab shape** in `TabStrip.css`:
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
- [x] **4. Joined to the toolbar.** The active tab and the toolbar must look like one surface: no
  line between them under the active tab. Check `Toolbar.css` and `TitleBar.css` for a
  `border-top` / `border-bottom` between them. If there is one, remove it only where it would
  separate the active tab from the toolbar (Chrome has no line there at all, so removing it
  completely is fine).
- [x] **5. Drag region.** The empty title-bar area right of the tabs must still carry
  `data-tauri-drag-region`, and the tabs must not. Check with a DOM query; don't change the
  markup unless task 3 needs a class.
- [x] **6. Window mode.** When the tab strip is hidden (the "Open files in: New window" setting
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

**Verify results:**
- `pnpm test`: 202 passed (added 2 new tests for chromeCss token)
- `pnpm lint`: passed
- `npx tsc --noEmit`: passed
- `pnpm format`: all files unchanged

**Manual checks:**

Computed styles (from eval output):
- Title bar background: `color(srgb 0.122353 0.122098 0.11598)` (darker)
- Toolbar background: `color(srgb 0.188235 0.187843 0.178431)` (lighter)
- Active tab background: `color(srgb 0.188235 0.187843 0.178431)` (matches toolbar)
- Active tab top position: 6px (rounded to nearest pixel) ✓
- Active tab border-top-left-radius: 8px ✓
- Drag region present: yes ✓

**Screenshots (all cropped to top ~120px as appropriate):**
1. Dark mode, current preset: `01-dark-current.png`
2. Dark mode, GitHub preset: `02-dark-github.png`
3. Light mode, GitHub preset: `03-light-github.png`
4. Light mode, Sequoia preset: `04-light-sequoia.png`
5. Dark mode, Sequoia preset: `05-dark-sequoia.png`
6. Window mode (no tabs), dark theme: `06-window-mode.png`

All screenshots are in: `C:\Users\bilal\AppData\Local\Temp\claude\C--Claude-Projects-mark-down-app--claude-worktrees-app-launch-windows-afd7ff\616d380a-62c7-4437-93b5-555683faa28b\scratchpad\polish-2\`

**Visual inspection:**
- Tabs have rounded top corners (8px radius) ✓
- Title bar is darker than toolbar/active tab ✓
- Active tab blends seamlessly with toolbar below it ✓
- Inactive tabs show separators (thin vertical lines) ✓
- Close button is round (18×18px) ✓
- New/+ button is round (28×28px) ✓
- Inactive tab hover effect shows rounded pill (using ::before with background) ✓
- Active tab bottom curves (::before and ::after radial gradients) are present and look correct ✓
- Window mode title bar displays correctly with darker background ✓

**Hover pill verification:**
CSS rule from `document.styleSheets`: `.tabstrip__tab:not(.is-active):hover::before { background: var(--chrome-hover); }`

Computed styles of inactive tab's `::before` pseudo-element:
- `inset: 0px 2px 4px` ✓
- `border-radius: 8px` ✓
- `z-index: -1` ✓

The hover pill effect is implemented with a `::before` pseudo-element on `.tabstrip__tab:not(.is-active)` that creates a rounded background box with the proper inset and border-radius. On hover, it receives `background: var(--chrome-hover)` for visibility. (No screenshots show hover state since CDP cannot hover; CSS rules verified instead.)

**Curves on active tab:**
Implemented with `::before` (bottom-left curve) and `::after` (bottom-right curve) on `.tabstrip__tab.is-active`, each using `radial-gradient(circle at 0 0/100% 0, transparent 8px, var(--chrome-bg) 8.5px)`. They stayed in and look correct in all screenshots.

**Separator visibility fix (Phase 2 follow-up):**
Added `is-before-active` class to tabs whose index equals `activeTabIndex - 1` in `TabStrip.tsx`. CSS rules hide separators (`::after`) on:
- `.tabstrip__tab.is-before-active::after` — tab immediately before the active tab
- `.tabstrip__tab:not(.is-active):hover::after` — hovered tab
- `.tabstrip__tab:not(.is-active):has(+ .tabstrip__tab:hover)::after` — tab before a hovered tab (using `:has` selector)

Verified with screenshots showing 3 tabs with different active tabs:
- Light Sequoia, middle tab active: separator hidden between gfm.md and math.md (before-active), visible between math.md and mermaid.md ✓
- Light Sequoia, last tab active: separator visible between gfm.md and math.md, hidden between math.md and mermaid.md (before-active) ✓
- Dark GitHub, middle tab active: separator hidden before math.md tab ✓
- Dark GitHub, last tab active: separator hidden before mermaid.md tab ✓
