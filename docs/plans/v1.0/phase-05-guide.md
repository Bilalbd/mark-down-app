# Phase 5: Built-in guide

Ship a user guide as a Markdown file inside the app and open it from a **Help** button, **F1** and
the start screen.

## Behaviour

- **The file:** `src-tauri/resources/guide/Guide.md`, bundled through `bundle.resources` in
  `tauri.conf.json` (keep the existing `icons/markdown-file.ico` entry). Its path at runtime comes
  from `resolveResource('resources/guide/Guide.md')` (`@tauri-apps/api/path`), wrapped in
  `src/lib/tauri.ts` as `guidePath(): Promise<string | null>` (`null` without Tauri; cache the
  result). Check that it resolves in the dev app as well as in an installed build (Phase 7 checks
  the installer).
- **Opening:** `openGuide()` opens that path through the normal `openPath` route, so it becomes a
  tab or a window according to *Open files in*, and a guide that's already open is focused, not
  opened twice.
- **Not a recent file:** opening the guide never adds it to `recentFiles`.
- **Can't be overwritten:** **Save** on the guide goes to **Save as** (default name `Guide.md`), and
  the Save as target guard refuses the guide's own path. Editing the guide is allowed; closing it
  after editing asks as usual.
- **Entry points:**
  - Toolbar: a **Guide** button with lucide `CircleHelp` (shared `ICON` props), `title="Guide
    (F1)"`, `aria-label="Guide"`, just before the Settings button.
  - **F1** anywhere in the app (in `App.tsx`'s shortcut map), also listed in the Settings shortcuts
    table and the README.
  - Start screen: a link-button *"New here? Read the guide"* in the empty-state hints, styled like
    the existing links there.

## Content

Write the guide for someone who has never used the app. British spelling, sentence-case headings,
second person, short paragraphs, real key names. **Every statement must be true of the app as it
is**: check each against the code or the running app, don't describe planned features, and don't
hard-code the version number (point to Settings → General instead). No screenshots (they'd go
stale with every preset); name buttons by their tooltip text.

Sections (H2), each short:

1. **Welcome**: what the app is, the three views in one paragraph, where to get help (F1).
2. **Opening and creating files**: double-click in Explorer, Open (Ctrl+O, several at once), drag
   and drop, recent files, New (Ctrl+N), encodings and line endings kept as they are.
3. **Tabs and windows**: the *Open files in* setting, tab shortcuts, the tab right-click menu,
   reordering, what happens when you open a file from Explorer while the app is running, tabs not
   restored on restart (by design).
4. **Views**: Formatted, Source, Split (swap panes, scroll sync, cursor mirror), full width, zoom.
5. **Editing**: the right-click menu, the formatting shortcuts, what each format produces, saving
   and Save as (the suggested file name), the unsaved-changes prompt, live reload when the file
   changes on disk.
6. **Spell check**: turning it on and off, choosing languages, **how to add a language to Windows**
   (Settings → Time & language → Language & region → Add a language; spelling comes with the
   language's basic typing feature), Add to dictionary and Ignore, the personal dictionary in
   Settings, and what isn't checked (code, links, maths, …).
7. **Outline and Find**.
8. **Styling**: app theme, presets, editing a preset's fonts and colours (light and dark), copying,
   importing and exporting presets, custom CSS with a small example.
9. **Links and images**: how each kind of link behaves, where local images may live, the *Block
   remote images* setting.
10. **Export and print**: HTML (self-contained or not), print and Save as PDF.
11. **Markdown cheat sheet**: for each construct, the source in a fenced code block followed by
    the rendered result: headings, emphasis, strikethrough, lists, task lists, quotes, links,
    tables, code with syntax highlighting, footnotes, inline and block maths, a small Mermaid
    diagram, a HEX colour swatch.
12. **Keyboard shortcuts**: the full table, identical to the one in Settings → General.
13. **Settings reference**: every setting, what it does, its default.
14. **Troubleshooting**: "the file changed on disk", the invalid-UTF-8 save prompt, no spelling
    languages listed, where settings and presets are stored (`%APPDATA%\com.bilal.markdown-viewer\`).

## Files

- `src-tauri/resources/guide/Guide.md` (new), `src-tauri/tauri.conf.json`.
- `src/lib/tauri.ts` (`guidePath`), wherever `openPath` / recent files / the save guard live
  (`src/store/tabs.ts`, `src/store/document.ts`) + tests.
- `src/components/Toolbar/Toolbar.tsx` (+ test), `src/App.tsx` (F1, start-screen link),
  `src/components/Settings/GeneralTab.tsx` (+ test).
- `README.md`: a Guide bullet and the F1 row.

## Tasks

- [ ] **1.** `guidePath`, `openGuide`, the recent-files exclusion, Save → Save as, the target guard,
  each with tests (mock `@tauri-apps/api/path`).
- [ ] **2.** Toolbar button, F1, start-screen link, Settings table, with tests.
- [ ] **3.** Write `Guide.md`. Check every shortcut and setting it mentions against `App.tsx`,
  `SourceEditor.tsx`, `GeneralTab.tsx` and `settings.ts`, and list any statement you couldn't
  verify in the Report.
- [ ] **4.** README.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`, `cargo check`.
- [ ] Dev app: open the guide with the button, F1 and the start-screen link, in tab mode and in
  window mode. F1 twice doesn't open two copies. It's not in recent files afterwards.
- [ ] Formatted view of the guide in **light and dark** and with at least three presets
  (Boulayla, GitHub, Manuscript): screenshots of the top, the cheat sheet's maths and Mermaid,
  and the shortcuts table. The outline lists every section.
- [ ] Edit the guide, press Ctrl+S: the Save as dialog appears (see the v0.8 Phase 6 supervisor
  note for reading the dialog), cancel it, and the installed/dev copy of `Guide.md` is unchanged
  (compare its hash before and after).
- [ ] Find (Ctrl+F) works in the guide.
- [ ] Commit: `Add a built-in guide`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
