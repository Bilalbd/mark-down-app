# Phase 2: Stop windows overwriting each other's settings

**Item:** A2. **README:** no change.

Read `docs/plans/review-followups/README.md` first, then `src/store/settings.ts`,
`src/store/settings.test.ts`, `src/store/style.ts`, `src/store/style.test.ts`, `src/App.tsx`, and
the `Store` class in `node_modules/@tauri-apps/plugin-store/dist-js/index.d.ts` (check that
`reload()` and `save()` exist and what `load()`'s options are).

## The bug

In **New window** mode each window is a separate process (`open_in_new_window` in
`src-tauri/src/commands.rs` starts the exe again with `--new-window`). Each process loads
`settings.json` and `presets.json` once into memory. A write (`store.set` + autosave) saves the
process's **whole** in-memory copy. So:

1. Window A and window B are open.
2. In A, change the theme to Light. `settings.json` now says light.
3. In B, open a file (this adds a recent file, which writes settings). B's copy still says Dark, and
   it writes the whole file, so **the theme goes back to Dark** on disk. A's recent files are also
   lost.

The same applies to `presets.json`. `refresh('openFilesIn')` in `App.tsx` already works around
this for one key. Phase 10 makes New window mode open many more windows, so this must be fixed
first.

## The fix

1. **Read-before-write, one write at a time.** Every write reloads the file from disk, sets the key,
   and saves straight away. Writes are queued on a promise chain, so two writes in one process
   never interleave.
2. **Pick up other windows' changes on focus.** When a window gains focus, it re-reads every saved
   setting and the presets from disk into its store (without writing anything).

## Files

- `src/store/settings.ts`, `src/store/style.ts`
- `src/App.tsx` (one effect)
- New tests: `src/store/settings.persist.test.ts`, `src/store/style.persist.test.ts` (separate files,
  because they `vi.mock('@tauri-apps/plugin-store')` and the existing tests rely on the
  no-Tauri fallback)

## Tasks

- [ ] **1. Settings writes.** In `settings.ts`:
  - Load the store with `autoSave: false` (keep `defaults`).
  - Add a module-level `let writeChain: Promise<void> = Promise.resolve();` and a helper
    ```ts
    /** Queues a write that re-reads settings.json first, so a value another window saved since we
     * loaded isn't overwritten with our stale copy. */
    function writeKey<K extends keyof Settings>(key: K, value: Settings[K]): void
    ```
    It appends to `writeChain`: `getStore()` → if null return → `await s.reload()` →
    `await s.set(key, value)` → `await s.save()`. Catch errors at the end of each link
    (`.catch(() => undefined)` with a comment: a failed write mustn't block later writes, and the
    in-memory value is still right for this session).
  - `set` and `persist` call `writeKey` instead of `s.set` directly.
- [ ] **2. `refreshAll`.** Add `refreshAll: () => Promise<void>` to `SettingsState` (JSDoc: re-reads
  every saved setting from disk, for when another window may have changed them). Implement like
  `load`: `await s.reload()`, read `entries()`, apply every key that's in `DEFAULTS` and not in
  `EPHEMERAL_KEYS`. Skip the `set()` call entirely if nothing differs (compare with `get()`;
  arrays compare with `JSON.stringify`), to avoid needless re-renders. Keep `refresh(key)` working as
  before (it's still used).
- [ ] **3. Presets.** In `style.ts`, same pattern: `autoSave: false`, a `writeChain`, and `persist()`
  does `reload()` → `set('activePresetId', …)` → `set('userPresets', …)` → `save()`. Add
  `refresh: () => Promise<void>` to the style store: reload, read both keys, normalise the user
  presets exactly as `load` does, and apply them (keep the active id valid, as `load` does). Skip the
  update if nothing changed. Factor the shared parsing out of `load` into a small function so `load`
  and `refresh` don't duplicate it.
- [ ] **4. Refresh on focus.** In `App.tsx`, add an effect (only `if (isTauri())`) that listens to
  `getCurrentWindow().onFocusChanged(({ payload: focused }) => …)` and, when `focused`, runs
  `useSettingsStore.getState().refreshAll()` and `useStyleStore.getState().refresh()` (both
  `void …` with `.catch(() => undefined)` and a comment saying why it's safe). Follow the existing
  `let unlisten` pattern. `core:default` already includes window focus events; confirm in the
  Report that no capability change was needed.
- [ ] **5. Regression tests.** Mock the plugin with a fake that has a shared "disk" `Map` and a
  per-store in-memory `Map`: `load` returns a store whose `reload()` copies disk → memory, `set`
  writes memory, `save()` copies memory → disk, `get`/`entries` read memory. Tests:
  - **Settings:** load; then change a key **on the fake disk only** (simulating another window);
    then call `set('appTheme', 'light')` and flush the chain (await a few microtask turns, or
    export a test-only `whenSettingsWritten()` that returns `writeChain`, documented as for tests).
    Expect the disk to have **both** the other window's value and `appTheme: 'light'`.
    Show this failing on the old code.
  - Two quick `set` calls in a row both end up on disk (order preserved).
  - `refreshAll` picks up a disk change, ignores `viewMode` even if the disk has it, and doesn't
    call `setState` when nothing changed (spy on `useSettingsStore.setState`, or compare state
    object identity).
  - **Presets:** the same "other window's change survives" test for `userPresets` +
    `activePresetId`, and `refresh` picks up a new user preset from disk.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check (dark theme; restore everything). Start the dev app on a scratch copy of
  `fixtures/gfm.md`. Read and note `appTheme`, `outlineWidth` and the recent-files count. Check the
  real write path works in one window: `set('outlineWidth', <current + 10>)`, wait 500 ms, read
  `%APPDATA%\com.bilal.markdown-viewer\settings.json` with the Read tool and show the new value.
  Then edit that JSON file with the Edit tool to change `outlineWidth` to another value (simulating
  a second window), trigger `__mdv.settings.getState().refreshAll()` and show the store picked it up.
  Put `outlineWidth` back to the original value through the store and confirm the file shows it.
  (A real two-window test isn't possible with CDP on one port; say so in the Report.)
- [ ] Commit: `Stop windows overwriting each other's settings`.

## Report

(fill in: tests before → after, the failing-then-passing output, the settings values before and
after your manual check, capability check result)
