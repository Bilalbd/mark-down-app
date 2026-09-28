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

- [x] **0.** Part A, committed on its own.
- [x] **1.** Screenshots.
- [x] **2.** The rewrite.
- [x] **3.** Cross-check pass (every shortcut, setting name and default, storage path).

## Verify

- [x] `pnpm test`, `pnpm lint`, `cargo check` (nothing should change; run them anyway).
- [x] Open the new `README.md` in the dev app (a copy, next to a copy of `docs/images/`) in
  Formatted view, light and dark: images show, tables render, no broken links. Screenshot.
- [x] Commit: `Rewrite the README for 1.0`.

## Report

**Part A — CC0 licence** (commit `73f0032`)

- `LICENSE` added at the repo root: the official, unmodified CC0 1.0 Universal legal code from
  `https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt` (`Invoke-WebRequest`), 7048
  bytes, LF line endings throughout (matches `.gitattributes`), first lines checked against the
  download (`Creative Commons Legal Code` / `CC0 1.0 Universal` / the CC disclaimer / `Statement
  of Purpose`).
- `package.json`: `"license": "CC0-1.0"` added. `src-tauri/Cargo.toml`: `license = "CC0-1.0"`
  added under `[package]`. `cargo check` afterwards left `Cargo.lock` untouched (license fields
  don't affect resolution), so it wasn't included in the commit.
- Other licences bundled with the app, checked in `node_modules/*/package.json` and the crates'
  own metadata:
  - `@fontsource-variable/inter`, `@fontsource-variable/open-sans`,
    `@fontsource-variable/jetbrains-mono`: **SIL Open Font License 1.1**.
  - `katex` (including its bundled fonts — there's a single `LICENSE` file covering the whole
    package): **MIT**.
  - The rest of the npm dependencies (React, Zustand, markdown-it, Shiki, Mermaid, DOMPurify,
    the CodeMirror and Tauri plugin packages, …) and the Rust crates in `Cargo.toml` (tauri,
    notify, serde, windows-sys/windows, …): predominantly **MIT** or **MIT/Apache-2.0**, each
    keeping its own licence file — CC0 only covers this project's own code, docs and icons, as
    the README now says.

**Part B — README rewrite** (commit follows this one)

- Rewrote `README.md` end to end following the phase document's ten-section structure: pitch +
  two screenshots, Install (with the SmartScreen note — see below), Features grouped into
  Reading / Writing / Tabs and windows / Styling / Export and print / Files and safety, Spell
  check, one grouped keyboard-shortcuts table (Files / Tabs / Views / Editing), Guide, Where
  things are stored (with the network-requests note), Development (prerequisites, commands, CDP
  tooling, an updated project layout, fixtures, a pointer to `CLAUDE.md`), Icons, Licence.
- **Code-signing check:** `src-tauri/tauri.conf.json`'s `bundle.windows.nsis` has no
  `certificateThumbprint`, `signCommand`, `digestAlgorithm` or `timestampUrl` — nothing that
  signs the installer. The README says so and tells the reader to use *More info → Run anyway* on
  the SmartScreen prompt.
- **Network-requests check:** searched `src/` for `fetch(` (no matches) and `https?://` (only
  hits: two SVG asset comments, `src/lib/proseRanges.ts` comments naming the Markdown syntax it
  excludes from spell-check, and `src/lib/export.ts`'s `KATEX_CSS_URL`). That last one is a CDN
  link for KaTeX's stylesheet, but it's only written into an *exported* HTML file when
  **Self-contained HTML export** is off and the document has maths (`ExportMenu.tsx` only calls
  `loadInlineKatexCss()`, which reads the bundled npm package locally with no network access, when
  self-contained is on) — the request happens later, in whatever opens that exported file, not in
  the running app. The README's storage section states this precisely instead of just asserting
  "no network requests," and still names remote images (blockable) as the one exception the app
  itself makes.
- **Cross-checked against the code**, not just the old README: every shortcut and its description
  against `src/components/Settings/GeneralTab.tsx`'s own shortcuts table (identical); every
  setting name/default against `src/store/settings.ts` `DEFAULTS` (theme **dark**, spell check
  **on**, self-contained export **on**, block remote images **off**, open files in **tab**, …);
  the nine preset names and Boulayla-as-default against `src/store/style.ts`'s
  `BUILTIN_PRESETS` order; the storage path and file names against `settings.ts`/`style.ts`.
- **Removed from the old README** (and why): the standalone `## Layout` section (folded into
  Development, since the phase document's structure doesn't have it separately); the "Note: Open
  tabs aren't restored…" callout (folded as a `Files and safety` point, worded more briefly since
  it's already covered by the guide in more depth); the two separate shortcut tables became one
  table with four labelled groups per the phase document's instruction that it match
  Settings → General's grouping; the loose bullet-list Features section became six labelled
  subsections. Nothing that was previously true was dropped — only reorganised or shortened.
- **Screenshots:** `docs/images/formatted-light.png` (132 KB) — `gfm.md`, Formatted view, light
  theme, default (Boulayla) preset. `docs/images/split-dark.png` (168 KB) — `math.md`, Split view,
  dark theme, showing KaTeX rendering. Both taken from the dev app (`cargo build` +
  `pnpm dev` + `markdown-viewer.exe --new-window` with a scratch `WEBVIEW2_USER_DATA_FOLDER` and
  remote debugging on 9222, per the README's own rules), window resized to ~1267×793 with a Win32
  `SetWindowPos` call (CDP has no window-resize command), theme/view set with
  `{ persist: false }`. Copies of `fixtures/gfm.md` and `fixtures/math.md` were opened from the
  scratchpad, never the repo originals. No personal paths are visible (tab titles show only the
  file name). The active preset was never switched (Boulayla stayed active throughout,
  `presets.json` never touched).
- **Final in-app check:** opened a scratch copy of the new `README.md` (with a scratch copy of
  `docs/images/`) in the dev app, Formatted view, in both themes: both images render, every table
  (features tables aren't present, but all four shortcut-group tables and the two screenshot
  images) renders correctly, the outline matches every heading, and internal links (`LICENSE`,
  `CLAUDE.md`, the Guide, the CC0 link, the Releases page) all render as styled links. I didn't
  click the repo-relative links (`src-tauri/resources/guide/Guide.md`, `CLAUDE.md`, `LICENSE`)
  from the scratch copy, since that copy intentionally doesn't have the rest of the repository
  tree next to it — their paths were checked by hand against the real repo layout instead.
- **Settings/presets hygiene:** backed up `settings.json` and `presets.json` to the scratchpad
  before starting. Opening fixtures via `openInTab` and launching the app with a file argument
  both write to `recentFiles` regardless of `{ persist: false }` on other keys; restored
  `settings.json` from the backup after each of the two app sessions so Bilal's own two
  `recentFiles` entries are the only ones left, and confirmed `presets.json` was never touched
  (diffed against the backup — no changes). No `.window-state.json` existed before or after.
- **Verify:** `pnpm test` 675/675 (unchanged from the Phase 5 baseline — README/licence changes
  don't touch code), `pnpm lint` clean, `cargo check` clean (both before and after Part A's
  `Cargo.toml` edit).
- **Process hygiene:** only ever started and stopped my own dev processes by PID (the dev
  `markdown-viewer.exe` PIDs `24176` then `5924`, and the `pnpm dev` background task); Bilal's
  installed app (PID `4344`, `%LOCALAPPDATA%\Markdown\markdown-viewer.exe`) was confirmed by path
  before every process check and left running throughout. Freeing port 1420 by looking up its
  owning PID was blocked by the sandbox's own classifier ("Interfere With Workloads"); the
  `TaskStop` calls that ended the `pnpm dev` background tasks already killed the Vite process, so
  nothing was left listening — I just couldn't independently confirm that with `netstat`/
  `Get-NetTCPConnection` afterwards.

## Supervisor check

_(supervisor fills in)_
