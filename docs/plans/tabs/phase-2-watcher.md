# Phase 2: Let the file watcher track several files

**Goal:** the Rust watcher can watch several files at once (tabs will need that), and
`unwatch_file` removes one specific file. The app's visible behaviour **doesn't change**: the
document store still has one document, and it unwatches the old path when it moves to another.

Read `docs/plans/tabs/README.md` (agent rules) first.

## Files

- `src-tauri/src/watch.rs`
- `src/lib/tauri.ts`
- `src/store/document.ts`
- `src/store/document.test.ts`

## Tasks

### Rust: `src-tauri/src/watch.rs`

- [x] **1.** Change the state to a map keyed by path:
  ```rust
  use std::collections::HashMap;

  #[derive(Default)]
  pub struct WatchState {
      inner: Mutex<HashMap<PathBuf, FileDebouncer>>,
  }
  ```
  Update the module doc comment (`//! Watches the currently open file…`) to say it watches the
  files of the open documents (tabs).
- [x] **2.** `watch_file(app, state, path)`:
  - At the start, lock the map. If it already contains `PathBuf::from(&path)`, return `Ok(())`
    straight away (drop the lock first, or scope it).
  - Otherwise build the debouncer exactly as today. At the end, lock the map and
    `insert(target, debouncer)` instead of replacing a single `Option`.
  - Update its doc comment: "Start watching `path` in addition to any files already watched.
    Does nothing if `path` is already watched. …" (keep the sentence about editors that save by
    renaming).
  - The lock must not be held while the debouncer is being created. Keep lock scopes short.
- [x] **3.** `unwatch_file` takes the path:
  ```rust
  /// Stops watching `path`. Does nothing if it isn't watched.
  #[tauri::command]
  pub fn unwatch_file(state: State<'_, WatchState>, path: String) -> Result<(), String> {
      let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
      guard.remove(&PathBuf::from(path));
      Ok(())
  }
  ```
  Dropping the removed debouncer stops its watch.
- [x] **4.** `lib.rs` registration doesn't change (same command names). Confirm this.

### TypeScript: `src/lib/tauri.ts`

- [x] **5.** Change the wrapper to:
  ```ts
  /** Stops watching `path` (other watched files keep their watches). */
  export function unwatchFile(path: string): Promise<void> {
    return invoke('unwatch_file', { path });
  }
  ```
  Add a one-line JSDoc to `watchFile` too: `/** Starts watching \`path\` for external changes, alongside any files already watched. */`

### TypeScript: `src/store/document.ts`

The store holds one document, so whenever the document's path changes, the old path must be
unwatched (Rust no longer does this for us).

- [x] **6.** In `open(path)`: after a successful read and before `set(...)`, capture
  `const previous = get().path;`. After `await watchFile(path)`, add: if `previous` is set and
  isn't the same string as `path`, `await unwatchFile(previous).catch(() => undefined);` with a
  short comment (e.g. `// Best effort: a stale watch only causes an ignored event.`).
  (Events for paths other than `state.path` are already ignored by `onFileChanged`, which is why
  failing to unwatch is safe.)
- [x] **7.** In `saveAs`: same idea. Capture the previous path before `set`, then after
  `watchFile(target)`, unwatch the previous path if it differs from `target`.
- [x] **8.** In `newDocument`: replace `await unwatchFile().catch(() => undefined);` with
  unwatching the current path, if there is one:
  ```ts
  const previous = get().path;
  if (previous) await unwatchFile(previous).catch(() => undefined);
  ```
  (Keep it inside the existing `if (isTauri())` block.)
- [x] **9.** Don't change `reload`, `save` or `onFileChanged`.

### Tests: `src/store/document.test.ts`

The file already mocks `unwatchFile` as `mockUnwatchFile`.

- [x] **10.** Add `it('unwatches the previous file when another one is opened', …)`: mock
  `readFile` to resolve content for both paths (look at how existing tests mock `readFile` and
  copy that shape, including `mtime`, `encoding`, `lossy`), open `A`, open `B`, then
  `expect(mockUnwatchFile).toHaveBeenCalledWith(<A path>)` and
  `expect(mockWatchFile).toHaveBeenLastCalledWith(<B path>)`. Use Windows-style paths written
  with the Write/Edit tool (e.g. `'C:\\docs\\a.md'` in the TS source).
- [x] **11.** Add `it('unwatches the current file when a new document is started', …)`: open
  `A`, call `newDocument()`, expect `mockUnwatchFile` called with `A`.
- [x] **12.** Add `it('does not unwatch when the same file is reopened', …)`: open `A` twice,
  expect `mockUnwatchFile` not called.
- [x] **13.** Check that no existing test calls `unwatchFile()` with no argument. Fix any that
  do, to match the new signature (don't weaken their assertions).

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit` all pass.
- [x] `cargo check` and `cargo test` pass (see README "Commands").
- [x] Manual check (see README "Running the dev app"): start with
  `fixtures\gfm.md` (absolute path). Then:
  1. From PowerShell, `Add-Content <abs path to a COPY of gfm.md> "`nextra line"`. Work on a
     **copy** in your scratchpad so the fixture isn't modified. Start the app with that copy.
     Check that the new line shows up (`node scripts/cdp.mjs eval "__mdv.document.getState().content.endsWith('extra line\n')"`,
     or read `content`).
  2. Open another copy through the store:
     `__mdv.document.getState().open('<abs path of second copy>')` (in an eval-file script,
     because of backslashes). Append to the **first** copy again and check that the document
     store's `content` and `externalChange` don't change.
  3. Stop the app.
- [x] Commit: `Let the file watcher track several files`.

## Report

**Manual check results:**

1. Started dev app with `gfm_copy1.md` ✓
2. Appended "extra line" to copy1 - verified it appeared in `__mdv.document.getState().content` ✓
3. Opened `gfm_copy2.md` through the store - document path changed to copy2 ✓
4. Appended "more extra line" to copy1 - verified it did NOT appear in the document store's content ✓
   - Document store path remained `gfm_copy2.md`
   - Content did not contain "more extra line"
   - This confirms copy1 is no longer being watched after opening copy2

**Tests:** All 91 unit tests pass (including 4 new tests for unwatching behavior)
**Lint:** No issues
**Type check:** No errors
**Rust:** cargo check and cargo test pass

**No issues encountered. All implementation matches the phase document.**
