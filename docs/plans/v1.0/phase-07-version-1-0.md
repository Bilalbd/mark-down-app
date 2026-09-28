# Phase 7: Version 1.0.0 and regression pass

Bump the version to 1.0.0 and run a full regression pass before calling it production ready.
The installer is built in Phase 8, after the startup fix.

## Tasks

- [ ] **1.** Version `1.0.0` in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
  and `src-tauri/Cargo.lock` (let `cargo check` update it). Search the repo for other `0.8.0`
  mentions outside `docs/plans/` and `node_modules/` and update any that describe the current
  version.
- [ ] **2.** Settings → General shows `Version 1.0.0`.
- [ ] **3.** Regression pass in the dev app, **light and dark**, with copies of the fixtures. Tick
  each and note anything wrong in the Report (fix nothing in this phase; report it):
  - [ ] Every fixture (`gfm`, `math`, `mermaid`, `unicode`, `colors`, `links`, `spelling`,
    `images/`, `tabs/`) renders in Formatted, Source and Split.
  - [ ] Round-trip saves keep encoding and line endings: `crlf.md`, `utf8-bom.md`, `utf16le.md`
    (edit one character, save, compare bytes with the original apart from that character).
  - [ ] An external change to an open file reloads it; with unsaved edits it asks first.
  - [ ] Tabs: open several, reorder, close others, Ctrl+W on a dirty tab asks.
  - [ ] *Open files in: New window* mode.
  - [ ] Export HTML (self-contained on and off) and print to PDF (`cdp.mjs pdf`).
  - [ ] Switch through every preset; edit a colour; custom CSS.
  - [ ] Spell check, right-click menus and formatting shortcuts (a short pass over Phases 2–4).
  - [ ] The guide opens from all three entry points.
  - [ ] `fixtures/huge.md`: open time, typing and scrolling with spell check on, compared with the
    numbers from Phase 2's Report.
  - [ ] Settings survive a restart (`settings.json` changes as expected; restore it afterwards as
    the README rules say).
- [ ] **4.** Known issues for the Report: anything the regression pass found.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `cargo check`, `cargo test`.
- [ ] Commit: `Bump version to 1.0.0`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
