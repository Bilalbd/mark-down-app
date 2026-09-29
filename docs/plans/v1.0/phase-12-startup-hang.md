# Phase 12: Fix the startup hang, then build the 1.0.0 installer

The last phase (it was Phase 8 until Bilal added Phases 8–11 on 2026-09-28). Bilal asked on
2026-09-28 for the hang parked during v0.8 to be fixed before 1.0.

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

**New clue (v1.0 Phase 2, 2026-09-28):** one dev-exe launch hung in WebView2 initialisation with
**no `msedgewebview2.exe` child appearing at all** for over 20 s, while Windows logged a Modern
Standby / idle session-disconnect event at the same moment (see the Phase 2 Report). So the browser
may never start, not only start and exit, and a power or session transition can trigger it. The
15 s watchdog didn't relaunch that process either before the agent killed it at 20+ s, which fits
cause 1 or 2. When reproducing (task 8), also try launching just as the session locks or resumes,
and check the System event log (Kernel-Power, Power-Troubleshooter) for the time of any hang you
see.

**Reproduced (v1.0 Phase 3 check, 2026-09-28, supervisor):** the PC entered Modern Standby at
12:07:59 (Kernel-Power 506, no 507 after it). Three dev launches at 12:12–12:16 all hung: the
window existed (cloaked, empty title), `EmbeddedBrowserWebView.dll` was loaded, 7 threads waiting,
the message loop still responding, but no `msedgewebview2.exe` child stayed alive (once one
appeared for under 3 s and exited; no crash event was logged). A **fresh**
`WEBVIEW2_USER_DATA_FOLDER` hung the same way, so it isn't a stale data folder. After 25+ s no
relaunch had happened and no watchdog thread was sleeping, so the watchdog fired but didn't
recover the process. So: **launching while Windows is in Modern Standby reproduces the hang on
demand**. Task 8 can use that (e.g. `powercfg`-driven or a manual lid/screen-off test) instead of
waiting for a GPU reset.

## The double-click side effect (added 2026-09-29, Bilal chose "fix + test the side effect")

Suspected by the supervisor from the code; **not yet seen**, so task 7 confirms it first. In the
hang the process has already initialised its plugins, so the single-instance plugin's hidden
`com.bilal.markdown-viewer-sic` window exists and the main thread's message loop still answers
(Phase 3 check). A later double-click on a `.md` file therefore:

1. runs `instance::existing_instance_is_hung`, which sends `WM_NULL` with a 2 s timeout, gets an
   answer and says "not hung";
2. forwards the file to the stuck process. Its single-instance callback pushes the path into
   `commands::PendingOpens` and emits `open-requested`, but that process has no page to receive
   it, and `REVEALED` is false, so nothing is shown;
3. exits. The user sees nothing, and the file is lost when the stuck process ends.

After task 1 the stuck process ends within about 15 s, so later double-clicks work again. The
gap to cover: **files forwarded to a stuck process must reach the relaunched copy**, not vanish.
The frontend already drains `PendingOpens` at startup (`App.tsx`, `handleOpenRequests` after
`getLaunchArgs`), so the relaunched copy only needs its queue seeded from its own arguments.

Known limitation, don't change it: the relaunch uses `--new-window`, so it skips the
single-instance plugin (otherwise it could forward to the dying original). After a recovery, the
next double-click opens its own window instead of a tab in the recovered one.

## Goal

Whatever WebView2 does, a launch **always** ends in one of: the window shows, a relaunched instance
takes over, or the user sees the error box and the process ends. Never an invisible process that
lives forever. Files double-clicked while a launch is stuck open in the relaunched copy. And the
next time it happens, there's a record of what happened.

## Tasks

- [x] **1. Watchdog exits for real.** Replace `std::process::exit(1)` in the watchdog with
  `TerminateProcess(GetCurrentProcess(), 1)` (windows-sys, feature `Win32_System_Threading`;
  `windows-sys` is already a direct dependency). It skips `atexit` and DLL detach, which is what's
  wanted for a stuck process that holds no unsaved data (setup never finished, so no document was
  opened). Comment why. Keep the non-Windows fallback as `std::process::exit`.
- [x] **2. Relaunch can't block the exit.** Spawn the relaunch on a separate helper thread and wait
  for its result at most 3 s (a channel with `recv_timeout`). Terminate either way afterwards. Keep
  the result (spawned PID or error) for the log.
- [x] **3. Failure log.** Only when the watchdog fires, append one line per event to
  `%LOCALAPPDATA%\com.bilal.markdown-viewer\startup.log` (the same folder Tauri already uses; don't
  create it anywhere else): timestamp, PID, args, which stages were reached (add cheap
  `AtomicBool`/timestamps for "builder started", "webview created" if Tauri gives a hook,
  "setup done", "app-ready"), and the relaunch result. Cap the file at 64 KB (truncate the oldest
  half when it's bigger). Never write it on a normal launch. Failures to write are ignored with a
  comment (logging must never stop the recovery).
- [x] **4. Look for a WebView2 failure signal.** Read how wry/Tauri create the WebView2 environment
  and controller in the versions in `Cargo.lock`, and whether a browser-process exit during creation
  is surfaced anywhere (an error from `CreateCoreWebView2EnvironmentWithOptions`, a
  `ProcessFailed` handler, a creation timeout). If there's a supported way to fail fast instead of
  waiting 15 s, describe it in the Report with file and line references; implement it only if it
  needs no fork or patch of Tauri/wry. Otherwise the watchdog stays the safety net.
- [x] **5. Make the path testable.** Pure pieces get `#[cfg(test)]` tests: the log line format, the
  size cap, and anything else you extract. `relaunch_args` tests stay as they are (add, don't
  change).
- [x] **6. End-to-end test with a simulated stall (debug builds only).** Add a
  `#[cfg(debug_assertions)]` check for an environment variable `MDV_TEST_STALL_STARTUP`. It must
  imitate the real hang: stall **inside `.setup()`, before `SETUP_DONE` is set**, so the plugins
  (including single-instance) are initialised and the main window exists, and keep **pumping the
  main thread's messages** (a `PeekMessageW`/`DispatchMessageW` loop with a short sleep) so the
  message loop still answers, as it does in the real hang. Values: `first` stalls only a launch
  without `--relaunched` (so the relaunch can succeed); `all` stalls every launch. None of it may
  exist in release builds (check with `cargo build --release` + `Select-String` on the exe for the
  variable name). Launch the dev exe with `first` (its own `WEBVIEW2_USER_DATA_FOLDER`, no
  `--new-window`, so it takes the single-instance lock like a real first launch) and confirm:
  after 15 s a relaunched process appears with `--relaunched`, the original process is gone, the
  relaunched one shows its window, and `startup.log` has the entry. Then use `all` and confirm the
  second stage: the error box appears and, once closed (`WM_CLOSE` to the box), the process is
  gone.
- [x] **7. Double-click during a stuck start: confirm, then cover.**
  - *Confirm first*, before changing the forwarding code: start a stalled first launch (`first`),
    then within the 15 s launch the dev exe again **without** `--new-window`, with the same
    `WEBVIEW2_USER_DATA_FOLDER` and a fixture path (`fixtures/gfm.md`), the way Explorer does.
    Record in the Report: does the second process exit at once, does nothing appear, and does the
    relaunched copy open without `gfm.md`? If the file isn't lost (the side effect doesn't
    happen), say so with evidence and skip the fix.
  - *Cover it*: when the watchdog fires, take the paths waiting in `PendingOpens` and pass them to
    the relaunch (for example as repeated `--open <path>` arguments; pick what fits the code). At
    startup, seed `PendingOpens` from those arguments so the frontend's existing startup drain
    opens them as tabs (or windows, per *Open files in*). The file from the original command line
    keeps working as it does today. Put the argument building and parsing in pure functions with
    tests (paths with spaces, several paths, no paths, `--relaunched` already present). Keep the
    `relaunch_args` tests as they are (add, don't change). If the relaunch fails too and the error
    box shows, the files are lost; that's acceptable, the user has been told.
  - *Check again* with the same steps: the relaunched window opens with `gfm.md`. Also try two
    fixtures double-clicked during the stall; both open.
  - *No regression*: with no stall, start the app, then launch it again with a file (as Explorer
    does): the file opens as a tab in the running window, as before. And select two fixtures in
    one launch burst (start two processes a few ms apart): both still end up in one window.
- [x] **8. Try to reproduce the real hang, safely.** Launch the dev exe and, during startup, stop
  **only the `msedgewebview2.exe` processes whose parent is the dev exe you started** (match by
  parent PID, never by name or path alone). Record what the app does: does creation fail, hang,
  and does the watchdog now recover within ~15 s? Try a few timings (right after the browser
  process appears, after 200 ms, after 1 s). If it can't be reproduced, say so; don't claim it's
  fixed beyond what the tests show.
- [x] **9. Update the known issue.** In `../v0.8-polish/README.md`, add one line under "Known
  issue" pointing here with the outcome (don't rewrite the section).
- [x] **10. Build the installer.** `pnpm tauri build`: expect
  `src-tauri/target/release/bundle/nsis/Markdown_1.0.0_x64-setup.exe`. Since Phase 11 the guide
  is inside the frontend bundle, not a separate resource, so check instead that the **release exe**
  (`src-tauri/target/release/markdown-viewer.exe`, run with `--new-window` and its own
  `WEBVIEW2_USER_DATA_FOLDER`) opens the guide window with F1. **Don't run the installer**:
  installing over Bilal's app needs his OK (the supervisor asks him).

## Files

- `src-tauri/src/lib.rs`, possibly a new `src-tauri/src/startup.rs` for the watchdog and log,
  `src-tauri/src/commands.rs` (seeding `PendingOpens`), `src-tauri/Cargo.toml` (windows-sys
  features), `docs/plans/v0.8-polish/README.md` (one line).

## Safety for launches without `--new-window`

Tasks 6 and 7 launch the dev exe **without** `--new-window`. It uses the same identifier as
Bilal's installed app, so if his app is running, the dev exe would hand its file to *his* app (or
probe it). Before every such launch, check that no process runs from
`%LOCALAPPDATA%\Markdown\markdown-viewer.exe`. If one does, **don't launch and don't close it**:
stop and report to the supervisor, who asks Bilal. Stop only processes you started, by exact PID.

## Verify

- [x] `cargo check`, `cargo test`, `cargo clippy` (no new warnings), `pnpm test`, `pnpm lint`,
  `npx tsc --noEmit`.
- [x] Task 6, 7 and 8 results, with the process list and log contents quoted in the Report.
- [x] A normal launch still shows the window with no flash and writes no `startup.log`.
- [x] Task 7's no-regression checks: a second launch with a file still opens it as a tab in the
  running window.
- [x] Commit: `Make the startup watchdog exit even when the process is stuck` (adjust the wording
  if the fix turns out different, keeping the style).

## Report

**Tests:** `pnpm test` 737 → 737 (no frontend change), Rust `cargo test` 56 → 77. `pnpm lint`, `npx tsc --noEmit`,
`cargo build`, `cargo test` pass; `cargo clippy` shows the same 3 warnings as before (`commands.rs` 43/45, `watch.rs` 37),
none in new code.

**What changed.** New `src-tauri/src/startup.rs` (watchdog, stage marks, log, debug stall); `lib.rs` (uses it, seeds
`PendingOpens`); `commands.rs` (`--open` handling, `PendingOpens` is now an `Arc`, `get_launch_args` marks the page as
started); `Cargo.toml` (windows-sys `Win32_System_Threading`); README (storage line, layout, dev env var);
`package.json`/`pnpm-lock.yaml` (see "Different from the plan", 2); `../v0.8-polish/README.md` (one paragraph).

### Different from the plan (decide or veto)

1. **The watchdog now also fires when setup finished but the page never started.** This is the real finding of
   task 8. The old watchdog only checked `SETUP_DONE`. Stopping the WebView2 browser during startup gave two outcomes
   in the ~55 runs I made: (a) creation blocks, `.setup()` never finishes (the case the plan describes), and (b)
   `.setup()` finishes, then the browser dies before the page runs. In (b) the process stays for ever: window not
   shown, no `msedgewebview2.exe` child, 10 threads, `EmbeddedBrowserWebView.dll` loaded, message loop answering, and
   the watchdog thread has already returned because `SETUP_DONE` is true. That matches the v0.8 report exactly
   ("watchdog no longer sleeping"), so the original hang is most likely (b), not `process::exit` blocking. In one
   25-run batch with the old gate: 13 recovered (a), 4 were stuck for ever (b), 8 were fine (WebView2 started a
   replacement browser). The fix: a launch is stuck unless setup finished **and** the page called its first Rust
   command (`get_launch_args`, marked as stage `frontend-started`). With that, a 24-run batch gave 14 relaunches (10 of
   kind (a), 4 of kind (b)), 10 healthy, 0 stuck. To go back to the plan's narrower check, change `is_stuck` in
   `startup.rs` to look at `SetupDone` only.
2. **`@tauri-apps/plugin-clipboard-manager` pinned to `~2.3.3`** (was `^2.4.0`). `pnpm tauri build` refused to run:
   the crate is at 2.3.3 (no 2.4 crate exists) and the npm package was 2.4.0 ("mismatched Tauri packages"). It was
   introduced in Phase 4 and never hit because dev launches skip the check. `cargo update` would have pulled tauri
   2.12 and wry 0.57, so I moved the npm side down instead (only `readText`/`writeText` are used). `pnpm test`,
   lint and tsc pass with it.
3. **README changed** although the plan doesn't list it: "Where things are stored" (it said nothing else is written;
   now names `startup.log`), the layout list (`startup.rs`), the dev section (`MDV_TEST_STALL_STARTUP`).

### Task 4: is there a WebView2 failure signal? No supported way to fail fast

- `wry-0.55.1/src/webview2/mod.rs:283` `create_environment` calls `CreateCoreWebView2EnvironmentWithOptions` (line 343)
  with a completion handler and then blocks in `webview2_com::wait_with_pump(rx)` (line 363). `create_controller`
  (line 367) does the same at line 414.
- `webview2-com-0.38.2/src/lib.rs:60` `wait_with_pump` is a `GetMessageA` loop with no timeout (line 69); it returns
  only when the handler sends a result. If the browser process dies first the handler never runs, so creation waits
  for ever. This confirms cause 3.
- There is no `ProcessFailed` (or browser-exited) handler in `wry`, `tauri-runtime-wry` or `tauri`
  (`grep -i ProcessFailed` finds nothing), and no creation timeout. `WebViewBuilderExtWindows::with_environment`
  (`wry-0.55.1/src/lib.rs:1778`) would let an app create the environment itself, but Tauri doesn't expose it, so using
  it needs a fork or patch. The watchdog stays the safety net; nothing implemented for this task.
- Plugin hook used for the log: `tauri::plugin::Builder::on_webview_ready` marks `webview-created` (never reached when
  creation hangs).

### Task 6: simulated stall (debug build, `MDV_TEST_STALL_STARTUP`)

`startup::stall_if_requested` runs first inside `.setup()`, pumps `PeekMessageW`/`DispatchMessageW` with a 10 ms sleep.
The name is absent from the release exe (`Select-String -SimpleMatch` and a byte scan, ASCII and UTF-16: false; the
same scan finds it in the debug exe).

- `first`, no `--new-window`, own `WEBVIEW2_USER_DATA_FOLDER` (pid 5964, 11:34:12). At 11:34:30: only
  `pid=17388 ppid=5964 title='Markdown' ... --new-window --relaunched`; the original was gone. CDP on the relaunched
  copy: title `Markdown`, `visibilityState` visible, the start screen rendered (screenshot checked). Log line:
  `2026-09-29T08:34:27Z pid=5964 args=[...markdown-viewer.exe] stages=[started=+0ms builder-run=+0ms webview-created=+483ms
  setup-start=+483ms setup-done=not-reached app-ready=not-reached] relaunch=started pid=17388 args=["--new-window",
  "--relaunched"]` (times are UTC; this was before `frontend-started` existed).
- `all` (pid 19620, 11:34:56): the original ended at ~15 s and spawned pid 20028; at 15 s more the second log line
  (`relaunch=none (already relaunched); showing the error box`) and a `#32770` box titled `Markdown` owned by 20028.
  `WM_CLOSE` to that box: process gone 3 s later. Repeated with the final build (pid 20244, relaunch 17984): same.

### Task 7: double-click during a stuck start

- **Confirmed before any change.** `first` launch pid 15284 (11:36:07); at 11:36:15 a second launch pid 18504 with the
  `gfm.md` copy, no `--new-window`, same data folder. It was gone within 1 s (not in the process list at 11:36:16),
  nothing appeared. The watchdog relaunched at 11:36:22 (pid 5416, `--new-window --relaunched`, no file); CDP:
  `document.path` null, one "New tab". So the file was lost, as the supervisor suspected.
- **Fix.** The watchdog reads the paths in `PendingOpens` (now `Arc<Mutex<Vec<String>>>`, read with `try_lock`) and
  the relaunch gets one `--open <path>` per path (`startup::relaunch_command_args`: repeats and the command-line file
  are skipped; `relaunch_args` and its tests untouched). At startup `PendingOpens::seeded(commands::opens_from_args(..))`
  queues them and the frontend's existing drain opens them. `launch_path` now skips the value after `--open`, so a
  handed-over file is never mistaken for the launch file (tests: spaces, several paths, none, `--relaunched` present).
- **Checked again.** `first` launch pid 4320 (11:38:07); `gfm.md` (pid 17532, 11:38:12) and `math.md` (pid 7080,
  11:38:14) launched during the stall; both exited at once. The relaunched pid 11224 had
  `--new-window --relaunched --open ...\gfm.md --open ...\math.md`; its tab strip showed `gfm.md`, `math.md` (math
  active). Repeated with the final build (pid 16356 -> 8960): same, and the log line quotes the `--open` arguments.
  No debug shim was needed in `take_pending_opens`: the stalled process never drained the queue (its page runs, and
  called `get_launch_args`, but events aren't delivered while `.setup()` is stalled).
- **No regression (debug exe, final build).** Normal start (pid 13996): window shown (`title='Markdown'`), no
  `startup.log` line added after 20 s. Second launch with `gfm.md` (pid 5888): exited, `gfm.md` opened as a tab in the
  running window. Two launches 5 ms apart (`math.md`, `unicode.md`; pids 18216 and 4788): one window, both tabs, no
  second window process (and 20 ms apart earlier with `gfm.md`/`unicode.md`).
- **Observation, not fixed:** in the relaunched window with two `--open` files, the outline still showed the first
  file's headings ("GFM Fixture") while `math.md` was active, and stayed like that. The two-file burst without a
  stall showed the right outline. I didn't investigate; it may be an old frontend issue when two files are opened in
  the same startup drain.

### Task 8: stopping the WebView2 browser during startup

Only `msedgewebview2.exe` processes whose parent PID was the dev exe I had just started were stopped (by PID, by a
script: `run8.ps1` polling WMI at ~150 ms, `run8b.ps1` a native loop noticing the process within ~1 ms and killing
it 3-5 ms later). Delays after first sight: 0, 200 ms and 1 s (0.7-1.3 s after launch with the slow poll, 0.44-0.72 s
with the fast one).

- Fast loop, 4 runs: WebView2 started a replacement browser (a new child of the dev exe), the app was healthy
  (`title='Markdown'`, 19 threads, CDP answered). So killing early is often survived.
- Slow poll, all delays, ~50 runs: three outcomes, not tied to the delay. (a) creation hangs, `.setup()` never
  finishes: the watchdog fired at 15.0 s, relaunched, the original was gone and the relaunched copy showed
  `Markdown`. (b) setup done, no page (described above): with the old gate the process lived for ever (4 of 25);
  with the new gate it was relaunched (4 of 24). (c) replacement browser started, app healthy.
- Result batch with the final logic (24 runs): 14 relaunched, 10 healthy, 0 stuck. The state in (b) is what the v0.8
  report describes; I could not tell whether `std::process::exit` would also have blocked, since it wasn't the
  failing step in anything I saw. `TerminateProcess` is in anyway, as the plan asks. Not reproduced: the GPU-reset and
  Modern Standby triggers (no power changes were made, and the PC didn't enter standby while I worked).

### Task 10: installer

`pnpm tauri build` (after the npm pin above): `src-tauri/target/release/bundle/nsis/Markdown_1.0.0_x64-setup.exe`
(6,563,273 bytes). **Not run.** The release exe (`--new-window`, own data folder, remote debugging on): main window
title `Markdown`; a synthetic F1 `keydown` opened a second window, class `Tauri Window`, title `Guide`, CDP target
`Guide - Markdown` at `http://tauri.localhost/index.html#guide`. I didn't take a screenshot of it.

### Housekeeping and what I could not verify

- Nothing of mine is running: every dev/release exe, relaunched copy, error box and the Vite server (pid 20308 with
  its `cmd` 19920) was stopped by exact PID. No process by name or path pattern; Bilal's installed app was never
  running while I launched (each launch script checked first).
- `settings.json`: backed up first; only `recentFiles` had changed (my fixtures); put back from the backup (same JSON
  content, the file was re-serialised so its size differs: 738 vs 769 bytes). `presets.json` untouched;
  `.window-state.json` unchanged (mtime 11:07). The backup skipped the dot-file, but its mtime shows it wasn't written.
- `%LOCALAPPDATA%\com.bilal.markdown-viewer\startup.log` didn't exist before; my tests wrote ~60 lines to it. I copied
  it to my scratchpad and deleted it so Bilal's folder is as it was.
- Not verified: the real trigger (GPU reset / standby), the installer itself, a visual "no flash" judgement of the
  normal start (the reveal code is untouched; I saw the window shown and no log), the error box's look (only its
  existence and closing).
- `rustfmt` was run on `startup.rs` only; older `commands.rs`/`lib.rs` diffs from `cargo fmt --check` were left.

## Supervisor check

_(supervisor fills in; include the installer check and, if Bilal agrees, the install test:
install, open a `.md` from Explorer, open the guide from the installed app, check the version.)_
