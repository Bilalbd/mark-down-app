# Phase 7: Version 0.8.0

With Phases 1–6 in, the app moves from 0.1.0 to **0.8.0**. The version is also shown in Settings →
General so it's visible in the app (supervisor decision; Bilal can veto).

## Files

- `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- `src/lib/tauri.ts` (a `getAppVersion()` wrapper)
- `src/components/Settings/GeneralTab.tsx` (+ `SettingsPanel.test.tsx` or a new test)
- `README.md` if it states a version anywhere

## Tasks

- [ ] **1.** Set `"version": "0.8.0"` in `package.json` and `src-tauri/tauri.conf.json`, and
  `version = "0.8.0"` in `src-tauri/Cargo.toml`. Run `cargo check` so `Cargo.lock` updates the
  `markdown-viewer` entry; commit the lock change (only that entry should change: check the diff).
- [ ] **2.** `tauri.ts`: `getAppVersion(): Promise<string | null>` using `getVersion()` from
  `@tauri-apps/api/app`; returns `null` outside Tauri (`isTauri()`), and `.catch(() => null)`
  with a comment that a missing version only hides the line.
- [ ] **3.** Settings → General: at the bottom, a muted line `Version 0.8.0` (loaded once on mount;
  nothing rendered while null). Tokens only; same font size as other secondary text in the panel.
  Test: with `@/lib/tauri` mocked to return `'0.8.0'`, the text `Version 0.8.0` appears.
- [ ] **4.** If the README mentions the version or the installer file name
  (`Markdown_0.1.0_x64-setup.exe`), update it.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`, `cargo check`, `cargo test`.
- [ ] Manual check in **light and dark**: Settings → General shows `Version 0.8.0` at the bottom.
- [ ] Don't build the installer; the supervisor does that after checking this phase.
- [ ] Commit: `Bump version to 0.8.0`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
