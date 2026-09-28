# Phase 10: Settings in five clear pages

Bilal's request (2026-09-28): arrange Settings "into a more presentable and structured way". His
choice: **keep the side panel** (the document stays visible while you change colours), with **five
pages**: General, Editor, Appearance, Shortcuts and About. Each page is made of **titled cards**,
and each setting has a short hint.

## Pages and cards (Bilal's layout; supervisor filled in the details)

**General**
- *Window*: Theme; Open files in.
- *Layout*: Show outline; Show status bar; Split layout; Highlight the cursor's block in Split view
  (from Phase 9); Preview zoom.
- *Documents*: Block remote images; Self-contained HTML export.

**Editor**
- *Editor*: Font size; Line numbers.
- *Spelling*: Check spelling; Languages (the list and note from Phase 2/2b, unchanged); Personal
  dictionary.

**Appearance**: today's Presets, Appearance and Custom CSS tabs become one page, with a small
segmented control at the top (**Presets · Fonts & colours · Custom CSS**, the same style as the
existing light/dark segment) that switches between the three. Their contents don't change.

**Shortcuts**: the full shortcut table, grouped as in the README (Files, Tabs, Views, Editing
(Source view)). Keep it as data, so the table and the tests stay in one place.

**About**
- The app icon and name, **Version 1.0.0** (read from Tauri, as today), and "Released under CC0 1.0".
- A **Guide** button (same action as F1), labelled "Open the guide".
- **Settings folder**: the path, with a button "Show in File Explorer" that reveals
  `%APPDATA%\com.bilal.markdown-viewer\` (use the existing reveal wrapper in `src/lib/tauri.ts`, and
  get the folder from `@tauri-apps/api/path`; add no new permission, and stop and report if one
  would be needed).

## Design rules

- Tabs across the top as today (five of them). They must fit on one line at the panel's minimum
  width, or wrap tidily; check at the narrowest window. Remember the last page while the app is open
  (not saved). Keyboard: tabs keep `role="tab"`, `aria-selected`, and arrow-key movement if the
  current tabs have it (read `SettingsPanel.tsx`).
- A **card** is a titled group with a subtle border and background from `--chrome-*` tokens, with
  consistent row spacing. Label on the left with its hint underneath in muted text, control on the
  right. Use the same `Row`/`Section` controls from `controls.tsx` where they fit; add a `Card` if
  needed. Every hint is one short sentence, in British spelling and sentence case.
- Both themes, and no raw hex values (tokens only; new tokens go in `app-theme.css` with light and
  dark values).
- Don't change what any setting does. This is layout and wording only (plus moving files).

## Files

`src/components/Settings/*`: split `GeneralTab.tsx` into page components, e.g. `GeneralPage.tsx`,
`EditorPage.tsx`, `AppearancePage.tsx` (wrapping the existing `PresetsTab`, `AppearanceTab`,
`CustomCssTab`), `ShortcutsPage.tsx` and `AboutPage.tsx`; plus `SettingsPanel.tsx`,
`SettingsPanel.css` and `controls.tsx`. Also `src-tauri/resources/guide/Guide.md` (every place it
says "Settings → General → …" must match the new pages; update the Settings reference to follow the
pages and cards), `README.md` (the same).

## Tests

Existing tests in `GeneralTab.test.tsx` and `SettingsPanel.test.tsx` **move with their code**; every
existing assertion must still exist (adapted to the new component or page), and none is dropped. List
each moved test in the Report. New tests: switching pages, remembering the page, the Appearance
segment switching sub-views, the About page's version line and Guide button, and the shortcut table
rows.

## Verify

- [ ] `pnpm test` (the count before and after; it must not go down), `pnpm lint`, `npx tsc --noEmit`,
  `pnpm format`.
- [ ] Dev app: screenshots of **every page** in **light and dark** (open each and describe it), plus
  General at the narrowest window width. Real clicks through the tabs and the Appearance segment.
  "Show in File Explorer" opens Explorer on the settings folder (a window screenshot, or confirm the
  Explorer window's title with PowerShell). "Open the guide" opens the guide.
- [ ] Every setting still works from its new place (flip a few with real clicks; restore the keys
  afterwards).
- [ ] Commit: `Arrange Settings into five pages`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
