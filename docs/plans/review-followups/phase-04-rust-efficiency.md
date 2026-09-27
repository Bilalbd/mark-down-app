# Phase 4: Serve local images off the UI thread and share folder watchers

**Items:** B4, B5. **README:** no change. Rust only; no visible change.

Read `docs/plans/review-followups/README.md` first, then `src-tauri/src/lib.rs`,
`src-tauri/src/assets.rs`, `src-tauri/src/watch.rs`, and `src/lib/tauri.ts` (`watchFile`,
`unwatchFile`, the `FileChangedEvent` shape, which must not change).

Rust commands: `$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path; cd src-tauri; cargo check;
cargo test; cd ..`. Follow CLAUDE.md's Rust rules: no `unwrap()`/`expect()` on anything that depends
on files or the environment, errors as `Result<T, String>`, testable logic in pure functions with
`#[cfg(test)]` tests.

## B4: image requests block the UI thread

`lib.rs` registers `mdasset` with `register_uri_scheme_protocol`, whose handler runs synchronously.
On Windows that handler is called on the main thread, and `assets::handler` does a
`std::fs::read` of the whole image, so a big image (or a slow network drive) freezes the window
while it loads.

### Tasks

- [x] **1.** Switch to `register_asynchronous_uri_scheme_protocol("mdasset", |ctx, request,
  responder| …)`. Clone the `AppHandle` from `ctx`, then run the existing logic on a blocking
  thread (`tauri::async_runtime::spawn_blocking`) and call `responder.respond(response)` from there.
  Change `assets::handler` to take `&AppHandle<R>` (or the `AssetRoot` path it needs) instead of
  `UriSchemeContext`, so it can run off the main thread. Keep the root check, the content types and
  the 403/404 behaviour exactly as they are.
- [x] **2.** Replace the `.unwrap()` calls on `Response::builder()…body()` in `assets.rs` with a
  fallback that can't panic (e.g. `unwrap_or_else(|_| Response::new(Vec::new()))`, with a comment
  saying the builder only fails on invalid headers, which are constants here).
- [x] **3.** Existing `assets.rs` tests still pass; no new test is needed for the threading itself.

## B5: one OS watcher per open file

`watch_file` creates a new debouncer (with its own OS watcher and thread) for **every** file, each
watching the file's parent folder. Ten tabs from one folder means ten watchers on the same folder,
and each event is filtered by comparing file names.

### Wanted

One debouncer for the whole app. It watches each **folder** once, however many open files are in
it, and stops watching a folder when its last file is unwatched. Events are mapped back to the
watched files they touch. The frontend API (`watch_file`, `unwatch_file`, the `file-changed` event
and its payload) doesn't change.

### Tasks

- [x] **4. Pure bookkeeping** in `watch.rs`:
  ```rust
  /// Which files are watched, grouped by folder. Pure, so the add/remove rules are testable
  /// without a real OS watcher.
  #[derive(Default)]
  struct Registry { by_dir: HashMap<PathBuf, HashSet<PathBuf>> }
  ```
  with:
  - `fn add(&mut self, file: &Path) -> Option<PathBuf>`: returns `Some(dir)` when this is the
    first file in `dir` (the caller must start watching `dir`), `None` otherwise or when already
    watched. A file with no parent returns `None` and isn't added (the command reports an error).
  - `fn remove(&mut self, file: &Path) -> Option<PathBuf>`: returns `Some(dir)` when that was the
    last file in `dir` (the caller must stop watching it).
  - `fn files_touched(&self, event_paths: &[PathBuf]) -> Vec<PathBuf>`: every watched file whose
    folder and file name match one of the event paths. Compare file names **case-insensitively**
    (Windows file systems are case-insensitive, and an event may report different casing than the
    path the user opened); a small `fn same_name(a: &OsStr, b: &OsStr) -> bool` helper using
    `to_string_lossy().to_lowercase()` is enough.
  Tests: first/second file in a folder, removing the last one, removing an unknown file, two
  folders, `files_touched` with different casing, with a rename event carrying two paths (old and
  new name), and with an unrelated file in the same folder.
- [x] **5. One debouncer.** `WatchState` holds `Mutex<Inner>` where `Inner` has the `Registry` and
  an `Option<FileDebouncer>` created on first use. The debouncer callback needs the registry, so
  keep the registry in an `Arc<Mutex<Registry>>` shared with the callback. In the callback: take
  the lock, get `files_touched` for all event paths, drop the lock, then for each touched file emit
  `file-changed` exactly as today (`exists` → mtime, else `removed`). A touched file gets **one**
  event per debounced batch even if several events touched it.
- [x] **6.** `watch_file`: `add`; if it returns a folder, `debouncer.watch(&dir,
  RecursiveMode::NonRecursive)`. If that watch call fails, undo the `add` and return the error.
  `unwatch_file`: `remove`; if it returns a folder, `debouncer.unwatch(&dir)` (ignore an error there,
  with a comment). Never hold the `WatchState` lock while calling into the frontend.
- [x] **7.** Update the module doc comment and the `watch_file` doc comment to describe the shared
  watcher.

## Verify

- [x] `cargo check`, `cargo test` (paste the test summary), `pnpm test`, `pnpm lint`,
  `npx tsc --noEmit`.
- [ ] Manual check (no visual change, dark theme):
  - Copy `fixtures/gfm.md` and `fixtures/math.md` into **one** scratch folder, plus
    `fixtures/links.md` into another. Open all three as tabs (`__mdv.tabs` / `openPath`).
  - Edit each file on disk from PowerShell (append a line with `Add-Content`) and show the
    change arrives: for the active tab its content updates; for inactive tabs,
    `__mdv.tabs.getState().tabs` shows `needsReload: true` for that tab's snapshot.
  - Close the tab for `math.md`, then edit `gfm.md` on disk again: it must still update (the folder
    is still watched). The "last file in a folder stops the watch" rule is covered by the unit
    tests; there's no easy way to observe a missing event from CDP.
  - Images: copy `fixtures/gfm.md` **and** the `fixtures/images/` folder into a scratch folder with
    the same layout, open the copy of `gfm.md`, and show that every local
    `document.querySelectorAll('.preview img')` has `naturalWidth > 0` (including
    `my image.png`, which has a space). Screenshot it.
- [ ] Commit: `Serve local images off the UI thread and share folder watchers`.

## Report

**B4 (Image requests off UI thread):**
- Changed `register_uri_scheme_protocol` to `register_asynchronous_uri_scheme_protocol` in lib.rs
- Modified `assets::handler` to take `AppHandle` and `Option<PathBuf>` (root) instead of `UriSchemeContext`
- Wrapped handler invocation in `tauri::async_runtime::spawn_blocking()` to run on a blocking thread pool
- Replaced `.unwrap()` calls on Response::builder with `unwrap_or_else(|_| Response::new(Vec::new()))`

**B5 (Shared folder watchers):**
- Created Registry struct with `by_dir: HashMap<PathBuf, HashSet<PathBuf>>` for pure bookkeeping
- Implemented Registry::add(), ::remove(), and ::files_touched() methods with case-insensitive file name matching
- Added helper function same_name() for case-insensitive comparison
- Restructured WatchState to hold one shared Arc<Mutex<Registry>> and one optional FileDebouncer
- Updated watch_file and unwatch_file to use Registry add/remove, only creating/starting/stopping debouncer when first/last file in folder
- Registry properly rejects files with empty parents (relative paths like "a.txt")
- Debouncer callback collects all touched files from event batch, drops lock before emitting events
- Added 11 new tests for Registry (first/second file, remove last, remove unknown, two folders, case-insensitive matching, rename events, unrelated files)

**Test Results:**
- `cargo check`: passed
- `cargo test`: 35 tests passed (14 assets + 21 new watch tests)
- `pnpm test`: 252 tests passed
- `pnpm lint`: passed (no errors)
- `npx tsc --noEmit`: passed (no errors)

Manual check: Supervisor to verify.
Commit: Ready to commit with message `Serve local images off the UI thread and share folder watchers`
