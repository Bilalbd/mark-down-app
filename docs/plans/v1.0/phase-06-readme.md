# Phase 6: CC0 licence and README rewrite

Two commits: first the licence, then the README.

## Part A: CC0 licence (Bilal's decision)

- `LICENSE` at the repo root: the **official, unmodified** CC0 1.0 Universal legal code, fetched
  from `https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt`. Don't retype or
  paraphrase it; compare the saved file against the download.
- `package.json`: `"license": "CC0-1.0"`. `src-tauri/Cargo.toml`: `license = "CC0-1.0"` under
  `[package]`.
- Check what's bundled under other licences and list it in the Report: the fonts in
  `@fontsource-variable/*` (SIL OFL), KaTeX fonts, and the npm and cargo dependencies. Their
  licences still apply to them; CC0 covers only this project's own code, docs and icons.
- Commit: `License the project under CC0 1.0`.

## Part B: README

The README grew one bullet at a time. Rewrite it as a proper front page for the project: for
people who want to **use** the app first, for people who want to **build** it second.

## Structure

1. **Title and pitch**: `# Markdown`, two or three sentences on what it is and who it's for, then
   two screenshots side by side or stacked: the formatted view in light theme and Split view in
   dark theme.
2. **Install**: download the installer (`Markdown_<version>_x64-setup.exe`), per-user install, no
   admin rights, registers `.md` / `.markdown`, needs the WebView2 runtime (built into Windows 11).
   Check whether the installer is code-signed (look for signing settings in `tauri.conf.json`); if
   it isn't, say that Windows SmartScreen may warn and how to continue.
3. **Features**, grouped with short bullets (no long paragraphs): Reading (views, outline, find,
   zoom, full width, links, remote images); Writing (editor, right-click formatting, shortcuts,
   spell check, saving, encodings); Tabs and windows; Styling (presets, themes, custom CSS);
   Export and print; Files and safety (live reload, unsaved-changes prompts, atomic saves).
4. **Spell check**: two or three sentences, including how to add a Windows language.
5. **Keyboard shortcuts**: one table, grouped (Files, Tabs, Views, Editing), identical to
   Settings → General.
6. **Guide**: the app has a built-in guide (F1 / the Guide button); link to
   `src-tauri/resources/guide/Guide.md` for reading it on GitHub.
7. **Where things are stored**: settings and presets folder; nothing else is written. Say that the
   app makes no network requests of its own (verify: search the source for `fetch(`, `http`, and
   Tauri HTTP plugins; remote images are the only exception and can be blocked).
8. **Development**: prerequisites, commands (from `CLAUDE.md` §2), the CDP dev tooling, the
   project layout (update it: `ContextMenu`, `StatusBar`, `spell.rs`, `resources/guide`, …),
   fixtures, and a pointer to `CLAUDE.md` for contributors and agents.
9. **Icons**: the existing icon-source paragraph.
10. **Licence**: CC0 1.0 (link to `LICENSE`), one sentence that you can use it for anything
    without asking, and one that bundled fonts and third-party libraries keep their own
    licences.

## Rules

- Every claim must be true of the app now. Cross-check each feature bullet and shortcut against
  the code. List anything you removed from the old README, and why, in the Report.
- British spelling in prose; sentence case in headings.
- Screenshots: take them from the dev app with `node scripts/cdp.mjs screenshot`, window around
  1280×800, using copies of fixtures that show off the renderer (e.g. `gfm.md`, `math.md`). Save
  as `docs/images/formatted-light.png` and `docs/images/split-dark.png`; keep each under 400 KB
  (resize or re-encode if needed, without new dependencies). No personal file paths visible in
  the screenshots (the title bar shows the file name only; check the tab tooltip isn't captured).
- Don't mention a version number except in the installer file-name pattern.

## Files

- Part A: `LICENSE` (new), `package.json`, `src-tauri/Cargo.toml` (and `Cargo.lock` if `cargo
  check` touches it).
- Part B: `README.md`, `docs/images/formatted-light.png`, `docs/images/split-dark.png` (new).

## Tasks

- [ ] **0.** Part A, committed on its own.
- [ ] **1.** Screenshots.
- [ ] **2.** The rewrite.
- [ ] **3.** Cross-check pass (every shortcut, setting name and default, storage path).

## Verify

- [ ] `pnpm test`, `pnpm lint`, `cargo check` (nothing should change; run them anyway).
- [ ] Open the new `README.md` in the dev app (a copy, next to a copy of `docs/images/`) in
  Formatted view, light and dark: images show, tables render, no broken links. Screenshot.
- [ ] Commit: `Rewrite the README for 1.0`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
