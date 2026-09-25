# Phase 7: Files opened from Explorer go to a tab or a new window

**Goal:** when the app is already running and the user opens a `.md` file from Explorer (double
click, Open With, or several selected + Enter), the running app gets the file. In tab mode it
opens as a tab and the window comes to the front. In window mode, a **new process** starts for
that file (as today). The decision is made in TypeScript, and Rust stays thin.

Read `docs/plans/tabs/README.md` (agent rules) first, then `src-tauri/src/lib.rs`,
`src-tauri/src/commands.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`,
`src/lib/tauri.ts`, `src/store/settings.ts`, `src/store/tabs.ts` (`openPath`) and `src/App.tsx`.

## How it works

```
Explorer → markdown-viewer.exe file.md
   └─ single-instance plugin: another instance is running → forward argv + cwd to it, exit
Running app (Rust):  callback → PendingOpens.push(path) → emit "open-requested" → focus main window
Running app (TS):    on "open-requested" → take_pending_opens() → for each path:
                        openFilesIn (re-read from disk) === 'tab' ? openInTab(path) : open_in_new_window(path)
open_in_new_window:  spawn current_exe --new-window path   (that process skips single-instance)
```

## Files

- `src-tauri/Cargo.toml` (new dependency), `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`
- `src/lib/tauri.ts`, `src/store/settings.ts` (+ test), `src/App.tsx`

## Tasks

### A. Rust

- [ ] **A1. Dependency.** From `src-tauri/`, with cargo on the path:
  `cargo add tauri-plugin-single-instance@2`. Don't add a JS package. The frontend never
  calls the plugin. The commit message must give the reason (see Verify).
- [ ] **A2. `launch_path` (pure, in `commands.rs`).**
  ```rust
  /// The file to open from a command line (`args[0]` is the exe): the first argument that isn't
  /// a flag, made absolute against `cwd` and normalised.
  pub fn launch_path(args: &[String], cwd: &Path) -> Option<String>
  ```
  Skip `args[0]`, take the first arg not starting with `-`. If it's relative, `cwd.join(it)`. Then
  normalise as `get_launch_args` does today (`components().collect::<PathBuf>()`). Rewrite
  `get_launch_args` as
  `launch_path(&std::env::args().collect::<Vec<_>>(), &std::env::current_dir().unwrap_or_default())`.
  Tests (`#[cfg(test)]`, next to the existing ones): absolute path; relative path joined to cwd;
  flags skipped (`--new-window`); no file → `None`; doubled backslashes normalised. Write Windows
  paths in the Rust tests with the Write/Edit tool.
- [ ] **A3. `PendingOpens` + `take_pending_opens`** (in `commands.rs`):
  ```rust
  /// Files forwarded by later launches (single-instance), waiting for the frontend to open them.
  #[derive(Default)]
  pub struct PendingOpens(pub Mutex<Vec<String>>);

  /// Returns and clears the forwarded files.
  #[tauri::command]
  pub fn take_pending_opens(state: State<'_, PendingOpens>) -> Result<Vec<String>, String>
  ```
  Use `std::mem::take` on the locked vec.
- [ ] **A4. `open_in_new_window`** (in `commands.rs`):
  ```rust
  /// Starts another copy of the app showing `path` in its own window ("Open files in: New window").
  #[tauri::command]
  pub fn open_in_new_window(path: String) -> Result<(), String>
  ```
  Return `Err("not a file")` unless `Path::new(&path).is_file()`. Then
  `std::process::Command::new(std::env::current_exe().map_err(|e| e.to_string())?)`
  `.arg("--new-window").arg(&path).spawn().map_err(|e| e.to_string())?;` and `Ok(())`. No shell;
  the arguments are passed separately.
- [ ] **A5. `lib.rs`.**
  - `let new_window = std::env::args().any(|a| a == "--new-window");`
  - Build the builder in steps: `let mut builder = tauri::Builder::default();` then, **if
    `!new_window`**, add the single-instance plugin **before any other plugin**:
    ```rust
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        if let Some(path) = commands::launch_path(&argv, Path::new(&cwd)) {
            if let Ok(mut pending) = app.state::<commands::PendingOpens>().0.lock() {
                pending.push(path);
            }
            let _ = app.emit("open-requested", ());
        }
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }));
    ```
    Then chain the existing plugins, `.manage(...)` etc. onto `builder` as today. Add
    `.manage(commands::PendingOpens::default())`, and register `commands::take_pending_opens`
    and `commands::open_in_new_window` in `generate_handler!`. Add a comment on why windows we
    start ourselves skip the plugin: they must not take the single-instance lock or forward to
    the first window.
  - Import `tauri::Emitter` and `std::path::Path` as needed.
- [ ] **A6. Capabilities.** App commands don't normally need capability entries. Only if Tauri
  refuses the call at runtime, add the narrowest entry and say so in the Report. Don't add
  plugin permissions for single-instance (it has no JS API).

### B. TypeScript

- [ ] **B1. `tauri.ts` wrappers**, safe without Tauri:
  ```ts
  /** Files forwarded by later launches of the app, waiting to be opened (clears the queue). */
  export async function takePendingOpens(): Promise<string[]> {
    if (!isTauri()) return [];
    return invoke<string[]>('take_pending_opens');
  }
  /** Starts another copy of the app showing `path` in its own window. */
  export function openInNewWindow(path: string): Promise<void> {
    return invoke('open_in_new_window', { path });
  }
  ```
- [ ] **B2. `settings.ts`: `refresh(key)`.** Another process (window mode) may have changed a
  setting on disk. Add to the store:
  ```ts
  /** Re-reads `key` from disk (another window's process may have changed it). */
  refresh: <K extends keyof Settings>(key: K) => Promise<void>;
  ```
  Implementation: `const s = await getStore(); if (!s) return; await s.reload(); const v = await s.get<Settings[K]>(key); if (v !== undefined) set({ [key]: v } as Partial<Settings>);`.
  Check that `Store.reload()` exists in the installed `@tauri-apps/plugin-store`
  (`node_modules/@tauri-apps/plugin-store/dist-js/index.d.ts`) and that `store:default` allows it
  (`src-tauri/gen/schemas` or the plugin's permissions). If not, report it; don't widen
  permissions without saying so. Add a test in `settings.test.ts` that `refresh` is a no-op
  outside Tauri.
- [ ] **B3. `App.tsx`: handle forwarded opens.**
  - A `useCallback` `handleOpenRequests`:
    ```ts
    if (!useSettingsStore.getState().loaded) return; // startup drains the queue once settings are in
    const paths = await takePendingOpens().catch(() => []);
    if (paths.length === 0) return;
    await useSettingsStore.getState().refresh('openFilesIn');
    for (const p of paths) {
      if (useSettingsStore.getState().openFilesIn === 'tab') await useTabsStore.getState().openInTab(p);
      else await openInNewWindow(p).catch((e) => useDocumentStore.setState({ error: `Could not open ${basename(p)}: ${String(e)}` }));
    }
    ```
    (Use `catch` with a comment where you ignore an error.) Put the "choose per path" part in
    `tabs.ts` as an exported `routeExternalOpen(path)` so it can be unit-tested, with tests for both
    modes (mock `openInNewWindow`).
  - An effect subscribing to `listen('open-requested', () => void handleOpenRequests())`, using the
    `let unlisten` pattern.
  - In the startup effect, after the launch-arg open, `await handleOpenRequests()` to pick up
    anything forwarded before the listener existed.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `cargo check`, `cargo test` pass.
- [ ] Manual check (README "Running the dev app"), started with `fixtures\gfm.md`. The debug exe
  is `src-tauri\target\debug\markdown-viewer.exe`.
  1. **Tab mode:** minimise the window (`__mdv` can't; use
     `window.__TAURI_INTERNALS__` only if easy, otherwise skip minimising and say so), then run
     `Start-Process src-tauri\target\debug\markdown-viewer.exe -ArgumentList '"<abs path>\fixtures\math.md"'`.
     Within a few seconds the running app has a `math.md` tab (check `__mdv.tabs`), and no second
     `markdown-viewer` process stays running (`Get-Process markdown-viewer` count).
  2. **Relative path:** `Start-Process … -WorkingDirectory <abs>\fixtures -ArgumentList 'mermaid.md'`
     → a `mermaid.md` tab.
  3. **Window mode:** `__mdv.settings.getState().set('openFilesIn','window')`, then launch with
     `unicode.md`. A **second** `markdown-viewer` process appears (count 2) and the first app
     gets no new tab. With CDP you'll now see two pages. `cdp.mjs` takes the first match, so
     just check the process count and take one screenshot.
  4. **Setting changed in another process:** leave that second window open. Switching the setting
     back to `tab` in the first window and launching again gives a tab in the first window.
  5. Stop **all** `markdown-viewer` processes and the dev server afterwards.
- [ ] Commit: `Open files from Explorer in a tab or a new window`, with this body line:
  `Adds tauri-plugin-single-instance so a second launch hands its file to the running app.`

## Report

_(Fill in: each manual step's result; whether `Store.reload` needed any permission; anything that
differed. Note: new windows open at the same position as the previous one, because
window-state restores one saved geometry. Say whether that's what you saw.)_
