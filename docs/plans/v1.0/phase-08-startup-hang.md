# Phase 8: Fix the startup hang, then build the 1.0.0 installer

The last phase. Bilal asked on 2026-09-28 for the hang parked during v0.8 to be fixed before 1.0.

## The issue (from `../v0.8-polish/README.md`, "Known issue")

During the v0.8 Phase 4 check the dev app hung twice at launch: no app window, no WebView2
process, `EmbeddedBrowserWebView.dll` loaded and every thread waiting. Windows logged GPU driver
resets (LiveKernelEvent 141) just before. The WebView2 browser started, wrote its state files and
exited, and the app waited for it forever. The 15 s startup watchdog from `3a56c5f` did **not**
relaunch or exit: no relaunched process appeared, and the watchdog thread was no longer sleeping.

## What the code does today (`src-tauri/src/lib.rs`, `run()`)

A watchdog thread sleeps `STARTUP_WATCHDOG` (15 s). If `SETUP_DONE` is still false it either
shows a `MessageBoxW` and calls `std::process::exit(1)` (already relaunched), or spawns the exe
again with `relaunch_args` (`--new-window --relaunched`) via `std::process::Command::spawn`,
ignoring the result, and then calls `std::process::exit(1)`.

## Likely causes (to confirm, not assume)

1. **`std::process::exit` can block.** It runs CRT `atexit` handlers and `DLL_PROCESS_DETACH` for
   every loaded DLL, which needs the loader lock. If the stuck main thread is inside WebView2's
   loader or a COM call holding a lock that a detach routine needs, `exit` never returns. That
   matches "watchdog no longer sleeping, process still there".
2. **`Command::spawn` may have failed or blocked**, and its result is discarded (`let _`), so
   there's no trace of which.
3. **Why WebView2 never reports failure:** when the browser process exits before the controller is
   created, the environment/controller completion handler may never be called, so wry's creation
   waits forever. The GPU driver reset probably killed the browser (GPU process crash).

## Goal

Whatever WebView2 does, a launch **always** ends in one of: the window shows, a relaunched instance
takes over, or the user sees the error box and the process ends. Never an invisible process that
lives forever. And the next time it happens, there's a record of what happened.

## Tasks

- [ ] **1. Watchdog exits for real.** Replace `std::process::exit(1)` in the watchdog with
  `TerminateProcess(GetCurrentProcess(), 1)` (windows-sys, feature `Win32_System_Threading`;
  `windows-sys` is already a direct dependency). It skips `atexit` and DLL detach, which is what's
  wanted for a stuck process that holds no unsaved data (setup never finished, so no document was
  opened). Comment why. Keep the non-Windows fallback as `std::process::exit`.
- [ ] **2. Relaunch can't block the exit.** Spawn the relaunch on a separate helper thread and wait
  for its result at most 3 s (a channel with `recv_timeout`). Terminate either way afterwards. Keep
  the result (spawned PID or error) for the log.
- [ ] **3. Failure log.** Only when the watchdog fires, append one line per event to
  `%LOCALAPPDATA%\com.bilal.markdown-viewer\startup.log` (the same folder Tauri already uses; don't
  create it anywhere else): timestamp, PID, args, which stages were reached (add cheap
  `AtomicBool`/timestamps for "builder started", "webview created" if Tauri gives a hook,
  "setup done", "app-ready"), and the relaunch result. Cap the file at 64 KB (truncate the oldest
  half when it's bigger). Never write it on a normal launch. Failures to write are ignored with a
  comment (logging must never stop the recovery).
- [ ] **4. Look for a WebView2 failure signal.** Read how wry/Tauri create the WebView2 environment
  and controller in the versions in `Cargo.lock`, and whether a browser-process exit during creation
  is surfaced anywhere (an error from `CreateCoreWebView2EnvironmentWithOptions`, a
  `ProcessFailed` handler, a creation timeout). If there's a supported way to fail fast instead of
  waiting 15 s, describe it in the Report with file and line references; implement it only if it
  needs no fork or patch of Tauri/wry. Otherwise the watchdog stays the safety net.
- [ ] **5. Make the path testable.** Pure pieces get `#[cfg(test)]` tests: the log line format, the
  size cap, and anything else you extract. `relaunch_args` tests stay as they are (add, don't
  change).
- [ ] **6. End-to-end test with a simulated stall (debug builds only).** Add a
  `#[cfg(debug_assertions)]` check for an environment variable `MDV_TEST_STALL_STARTUP=1` that makes
  the main thread sleep forever **before** `tauri::Builder` runs, so the watchdog fires. It must not
  exist in release builds (check with `cargo build --release` + `strings`/`Select-String` on the exe
  for the variable name). Launch the dev exe with it (its own `WEBVIEW2_USER_DATA_FOLDER`,
  `--new-window`), and confirm: after 15 s a relaunched process appears with `--relaunched`, the
  original process is gone, the relaunched one shows its window, and `startup.log` has the entry.
  Then set the variable for the relaunch too (it inherits the environment) and confirm the second
  stage: the error box appears and, once closed (`WM_CLOSE` to the box), the process is gone.
- [ ] **7. Try to reproduce the real hang, safely.** Launch the dev exe and, during startup, stop
  **only the `msedgewebview2.exe` processes whose parent is the dev exe you started** (match by
  parent PID, never by name or path alone). Record what the app does: does creation fail, hang,
  and does the watchdog now recover within ~15 s? Try a few timings (right after the browser
  process appears, after 200 ms, after 1 s). If it can't be reproduced, say so; don't claim it's
  fixed beyond what the tests show.
- [ ] **8. Update the known issue.** In `../v0.8-polish/README.md`, add one line under "Known
  issue" pointing here with the outcome (don't rewrite the section).
- [ ] **9. Build the installer.** `pnpm tauri build`: expect
  `src-tauri/target/release/bundle/nsis/Markdown_1.0.0_x64-setup.exe`. Check it contains
  `resources/guide/Guide.md` (the staged resource under `src-tauri/target/release/`, or list the
  installer's contents with 7-Zip if installed). **Don't run the installer**: installing over
  Bilal's app needs his OK (the supervisor asks him).

## Files

- `src-tauri/src/lib.rs`, possibly a new `src-tauri/src/startup.rs` for the watchdog and log,
  `src-tauri/Cargo.toml` (windows-sys feature), `docs/plans/v0.8-polish/README.md` (one line).

## Verify

- [ ] `cargo check`, `cargo test`, `cargo clippy` (no new warnings), `pnpm test`, `pnpm lint`,
  `npx tsc --noEmit`.
- [ ] Task 6 and 7 results, with the process list and log contents quoted in the Report.
- [ ] A normal launch still shows the window with no flash and writes no `startup.log`.
- [ ] Commit: `Make the startup watchdog exit even when the process is stuck` (adjust the wording
  if the fix turns out different, keeping the style).

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in; include the installer check and, if Bilal agrees, the install test:
install, open a `.md` from Explorer, open the guide from the installed app, check the version.)_
