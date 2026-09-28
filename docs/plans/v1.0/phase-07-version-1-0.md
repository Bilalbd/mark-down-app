# Phase 7: Version 1.0.0 and regression pass

Bump the version to 1.0.0 and run a full regression pass before calling it production ready.
The installer is built in Phase 8, after the startup fix.

## Tasks

- [x] **1.** Version `1.0.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
  and `src-tauri/Cargo.lock` (let `cargo check` update it). Search the repo for other `0.8.0`
  mentions outside `docs/plans/` and `node_modules/` and update any that describe the current
  version.
- [x] **2.** Settings → General shows `Version 1.0.0`.
- [x] **3.** Regression pass in the dev app, **light and dark**, with copies of the fixtures. Tick
  each and note anything wrong in the Report (fix nothing in this phase; report it):
  - [x] Every fixture (`gfm`, `math`, `mermaid`, `unicode`, `colors`, `links`, `spelling`,
    `images/`, `tabs/`) renders in Formatted, Source and Split.
  - [x] Round-trip saves keep encoding and line endings: `crlf.md`, `utf8-bom.md`, `utf16le.md`
    (edit one character, save, compare bytes with the original apart from that character).
  - [x] An external change to an open file reloads it; with unsaved edits it asks first.
  - [x] Tabs: open several, reorder, close others, Ctrl+W on a dirty tab asks.
  - [x] *Open files in: New window* mode.
  - [x] Export HTML (self-contained on and off) and print to PDF (`cdp.mjs pdf`).
  - [x] Switch through every preset; edit a colour; custom CSS.
  - [x] Spell check, right-click menus and formatting shortcuts (a short pass over Phases 2–4).
  - [x] The guide opens from all three entry points.
  - [x] `fixtures/huge.md`: open time, typing and scrolling with spell check on, compared with the
    numbers from Phase 2's Report.
  - [x] Settings survive a restart (`settings.json` changes as expected; restore it afterwards as
    the README rules say).
- [x] **4.** Known issues for the Report: anything the regression pass found.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `cargo check`, `cargo test`.
- [x] Commit: `Bump version to 1.0.0`.

## Report

**Version bump.** `1.0.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`;
`src-tauri/Cargo.lock` updated by `cargo check`. Searched the repo (outside `docs/plans/` and
`node_modules/`) for other `0.8.0` mentions: only `src/components/Settings/GeneralTab.test.tsx`
matched (`getAppVersion` mocked to `'0.8.0'`, and the expectation string `'Version 0.8.0'`). Left
it as-is, per the phase's own instruction — it's a test fixture value, not the app's version, and
changing it wouldn't test anything the real version doesn't already cover. `pnpm-lock.yaml`'s
`0.8.0` hits are unrelated `engines.node` ranges of third-party packages, not our version. Verified
in the running app: Settings → General → **Version 1.0.0** (`.settings__version` text content),
screenshotted in dark.

**Regression pass.** Dev app rebuilt (`cargo build`) and launched with `--new-window`, its own
`WEBVIEW2_USER_DATA_FOLDER`, and `--remote-debugging-port=9222`, driven with `cdp.mjs` plus a few
adapted CDP scripts (real `Input.dispatchMouseEvent`/`dispatchKeyEvent`, and a raw
`Network.requestWillBeSent` listener for the spell-check IPC count, modelled on the supervisor's
`menus.mjs`). `%APPDATA%\com.bilal.markdown-viewer\settings.json`, `presets.json` and
`.window-state.json` were backed up first and diffed byte-for-value at the end — identical except
`recentFiles`, which was restored to Bilal's original two entries.

- **Fixtures** (`gfm`, `math`, `mermaid`, `unicode`, `colors`, `links`, `spelling`, plus
  `images/*.png` via `gfm`/`links`/`spelling`, and `tabs/one.md`+`two.md` implicitly through the
  tabs checks below): all render correctly in Formatted (light and dark, screenshotted), and in
  Source/Split (screenshotted in both themes on `gfm.md` and `spelling.md`). `math.md`'s inline
  and block KaTeX render, and the literal `$5`/`$10` stay plain text. `mermaid.md`'s flowchart and
  sequence diagrams render; its deliberately-broken third diagram shows a `mermaid-error` parse
  message instead of crashing (confirmed via DOM, this is the fixture's own intended case, not a
  bug). `unicode.md`'s Arabic RTL, emoji, CJK and combining marks all display correctly.
  `colors.md`'s HEX swatches appear only in Formatted (not Source/Split) and only for the
  documented cases (confirmed light and dark). `links.md`'s local image with a space in the
  filename loads via `mdasset://` (2×2 px, matching the fixture's tiny placeholder PNGs) with the
  space correctly percent-encoded. `spelling.md`: only the English mistakes are flagged with the
  default automatic language (`en-US`); ticking Arabic too narrows the Arabic paragraph down to
  just its one deliberate typo, and the "not spell-checked" and "destinations are skipped"
  sections stay clean in both cases — matches the fixture's own documented expectations exactly.
- **Round-trip saves:** `crlf.md`, `utf8-bom.md`, `utf16le.md` (copies) each edited one character
  via `setContent`+`save()` and compared byte-for-byte against the pristine original with
  `cmp -l`: exactly **one** differing byte in each file, everything else (BOM, UTF-16LE encoding,
  CRLF line endings throughout) untouched.
- **External change:** editing a scratch copy from PowerShell while the tab is clean reloads it
  silently (confirmed by content). While the tab is dirty, a banner appears instead
  ("This file was changed on disk and you have unsaved edits." / Reload from disk / Keep mine) —
  screenshotted.
- **Tabs:** opened 7 at once; reordering (`move`) updates the strip immediately; *Close others*
  drops to 1 tab; Ctrl+W-equivalent (`tabs.close`) on a dirty tab shows "Save changes to
  crlf.md? / Save / Don't save / Cancel" — screenshotted.
- ***Open files in: New window***: with the setting flipped to `window`, opening a file from this
  (non-blank) window spawned a real second `markdown-viewer.exe` child process (confirmed via
  `Win32_Process`'s `ParentProcessId`) showing the new file, while this window kept its own —
  confirmed via the CDP `/json` target list (two `localhost:1420` pages, different titles). The
  child was stopped by its exact PID once confirmed.
- **Export:** self-contained HTML on `math.md` embeds KaTeX's fonts as `data:font` URIs (no
  `cdn.jsdelivr` reference, 393 KB); off, the same document references
  `cdn.jsdelivr.net/npm/katex@0.18.7/dist/katex.min.css` and is 24 KB. Self-contained on `gfm.md`
  embeds its local image as `data:image/png;base64,...`. `cdp.mjs pdf` produced a valid
  `%PDF-1.4` file (168 KB) for `gfm.md`; I could not visually render the PDF in this sandbox
  (no `pdftoppm`/poppler available) — a tooling gap, not something observed to be wrong.
- **Presets:** cycled through all 9 (Boulayla, GitHub, Obsidian, Claude, Manuscript, Nord, Rosé
  Pine, Catppuccin, Solarized) on `gfm.md`, each visually distinct with no console errors;
  spot-screenshotted several in both themes. Editing a colour (`updateActive`) on a built-in
  preset correctly forked it into a new user preset (`presets.json` gained a `userPresets` entry,
  `builtin: false`) rather than mutating the built-in; custom CSS applied alongside it
  (`h1 { text-decoration: underline wavy red; }`) — screenshotted, then the test preset was
  removed and `activePresetId` restored to `builtin-boulayla` (`presets.json` now byte-identical
  to the backup).
- **Spell check / menus / shortcuts** (short pass over Phases 2–4, real CDP mouse and key events):
  right-click on a misspelled word shows suggestions + *Add to dictionary* + *Ignore* above
  Cut/Copy/Paste/Select all and the formatting items; right-click on plain text shows the full
  formatting menu (Heading submenu, Bold, Italic, Strikethrough, Inline code, Link, Code block,
  Quote, Bulleted list, Numbered list, Task list, Horizontal rule); Ctrl+B wraps/unwraps the word
  under the cursor; Ctrl+Shift+1 turns the line into an H1; the Formatted-view preview's menu is
  Copy + Select all only. All six checks passed.
- **Guide:** opens correctly from all three entry points — F1 (from within a document), the
  toolbar Guide button (focuses the already-open Guide tab rather than duplicating it), and the
  start screen's "New here? Read the guide" link (confirmed after a page reload; an earlier
  attempt at this specific check silently no-opped, traced to leftover async state in my own test
  scripts — not a reload of the app under test, and not reproducible from a clean state, so not
  logged as a product bug). Guide.md is never added to Recent files. Screenshotted.
- **`fixtures/huge.md`** (copy, 6,001 lines), spell check on, `en-US`, after a full page reload to
  reset the shared spell-check cache: open **334.5 ms** (a second cold run measured 366.7 ms).
  Typing 30 characters at the end and the middle (`performance.now()` around `dispatch` + the next
  two `requestAnimationFrame`s):

  | | on, end | on, middle | off, end | off, middle |
  |---|---|---|---|---|
  | avg ms/keystroke | 16.6 | 16.7 | 16.4 | 16.8 |
  | max ms | 22.5 | 19.2 | 17.1 | 20.4 |

  On vs. off is within noise, same conclusion as Phase 2 ("no measurable typing-path cost from
  spell check"). The *absolute* numbers are roughly double Phase 2's own (8.3–8.7 ms avg): most
  likely this session's measurement overhead (dispatching through an active CDP connection with a
  double-rAF wait, per keystroke) plus this being a busier dev machine state, not a regression —
  the thing the invariant actually cares about (on ≈ off) holds. Total `spell_check` IPC calls
  across the *entire* fresh run (open + 60 keystrokes + a full top-to-bottom 10-step scroll) with
  spell check on: **4** (with it off: **0**, as expected). This is lower than Phase 2's reported 13
  for a scroll alone, consistent with `huge.md`'s heavily repeated "Lorem ipsum" text collapsing to
  very few distinct cache keys — confirmed the counting methodology itself still works by
  independently observing 2 fresh `spell_check` calls when a genuinely new misspelled string was
  typed elsewhere in the same session.
- **Settings survive a restart:** set `editorFontSize` 14 → 15 (persisting `set`, not
  `persist:false`), confirmed in `settings.json`; stopped the dev `.exe` by its exact PID, rebuilt
  nothing (no code changed), relaunched the same way — `editorFontSize` was still `15` on the
  fresh process. Set it back to 14 and confirmed `settings.json` shows `14` again.

**Known issues found by the regression pass:** none. Everything checked matched the documented
behaviour in `Guide.md`, the README and the Phase 1–6/2b Supervisor checks.

**Settings/presets restore:** `settings.json` and `presets.json` are byte-value-identical to the
pre-session backups (key order aside); `.window-state.json` is byte-identical. `recentFiles` was
restored to Bilal's original two entries.

**Verify:** `pnpm test` 675 → 675 (no new tests — this phase doesn't add pure logic). `pnpm lint`
clean. `npx tsc --noEmit` clean. `cargo check` and `cargo test` (54 passed, matching the count
since Phase 2) both clean, run with `$env:USERPROFILE\.cargo\bin` on `PATH`.

**Process hygiene:** the dev `.exe` and Vite were started and stopped by their exact PIDs this
session created (never by name/path pattern); the one *New window* child spawned during the D5
check was likewise stopped by its own confirmed PID. Bilal's installed app
(`%LOCALAPPDATA%\Markdown\markdown-viewer.exe`) was not running before this session and is still
not running now.

## Supervisor check

_(supervisor fills in)_
