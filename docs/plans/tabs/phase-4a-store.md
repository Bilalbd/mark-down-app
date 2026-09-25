# Phase 4a: Tabs store (logic only)

**Goal:** a zustand store, `src/store/tabs.ts`, that keeps a list of tabs and swaps the **active**
tab's document in and out of the existing document store. It is fully unit-tested. **No UI or
component changes in this phase.** Phase 4b wires it into the editor, preview and `App.tsx`.

Read `docs/plans/tabs/README.md` (agent rules) and `docs/plans/tabs.md` §0 ("Architecture: swap
the active document") first. Then read `src/store/document.ts`, `src/store/document.test.ts`,
`src/store/settings.ts`, `src/store/view.ts` and `src/lib/tabs.ts` (Phase 3 helpers: use them).

## The model

- `useDocumentStore` always holds the tab **on screen**. Components keep reading it as today.
- Each **inactive** tab stores a snapshot. The active tab's `snapshot` is `null`.
- `viewMode` (settings store, not saved to disk) and `topLine` (view store) are per tab. They're
  captured into the snapshot when a tab is deactivated and restored when it's activated.
- The store **always** has at least one tab. At startup that's a single tab showing the start
  screen (`hasDocument: false`).
- One tab per file: opening a file that's already open activates its tab.

## Files

- `src/store/document.ts` (small, additive changes)
- `src/store/document.test.ts` (keep passing; don't weaken)
- `src/store/tabs.ts` (new)
- `src/store/tabs.test.ts` (new)

## Tasks

### A. `src/store/document.ts`

- [ ] **A1. `DocFields`.** Export the data part of the state:
  ```ts
  /** The document's data, without actions: what a tab snapshot stores. */
  export type DocFields = Pick<
    DocumentState,
    | 'path' | 'hasDocument' | 'content' | 'savedContent' | 'mtime' | 'eol'
    | 'encoding' | 'lossy' | 'loadId' | 'error' | 'externalChange'
  >;
  ```
  Also export `EMPTY_DOC: DocFields` (path null, hasDocument false, empty strings, mtime 0, eol
  `'\n'`, encoding `'utf8'`, lossy false, loadId 0, error null, externalChange null), and use it
  for the store's initial values instead of repeating the literals.
  Export `pickDocFields(s: DocFields): DocFields`, which copies just those keys (so snapshots
  don't carry the store's functions).
- [ ] **A2. Globally unique `loadId`.** Add a module-level counter:
  ```ts
  let loadCounter = 0;
  /** Returns a new load id, unique across all tabs, so a restored tab never looks like a fresh load. */
  export function nextLoadId(): number {
    return ++loadCounter;
  }
  ```
  Replace every `loadId: s.loadId + 1` with `loadId: nextLoadId()` (in `open`,
  `openWithDialog`'s browser fallback, `newDocument` and `reload`). The existing test
  "increments loadId…" must still pass unchanged.
- [ ] **A3. `load(path)`.** Split `open` in two: `load(path): Promise<boolean>` does everything
  `open` does **after** the `confirmDiscard()` check (read, set, watch, the Phase 2 unwatch of the
  previous path, recent files, error handling). `open` becomes:
  ```ts
  open: async (path) => {
    if (!(await get().confirmDiscard())) return false;
    return get().load(path);
  },
  ```
  Add `load` to the `DocumentState` interface with the JSDoc
  `/** Open a file by path without asking about unsaved changes (the caller already has). */`.
- [ ] **A4. Save-target guard.** `saveAs` must not write to a file that another tab has open
  with unsaved edits. The document store can't import the tabs store (that would be a circular
  import), so the tabs store registers a guard:
  ```ts
  /** Decides whether Save As may write to `target`; the tabs store installs one. */
  export type SaveTargetGuard = (target: string) => 'ok' | 'blocked';
  let saveTargetGuard: SaveTargetGuard = () => 'ok';
  /** Installs the check `saveAs` runs before writing (see the tabs store). */
  export function setSaveTargetGuard(guard: SaveTargetGuard): void {
    saveTargetGuard = guard;
  }
  ```
  In `saveAs`, right after `if (!target) return false;`, add:
  ```ts
  if (saveTargetGuard(target) === 'blocked') {
    set({ error: 'That file is open in another tab with unsaved changes.' });
    return false;
  }
  ```
- [ ] **A5.** Don't change anything else in `document.ts`.

### B. `src/store/tabs.ts`

- [ ] **B1. Types and state.**
  ```ts
  export interface TabSnapshot {
    doc: DocFields;
    viewMode: ViewMode;
    topLine: number;
    /** The file changed on disk while this tab was inactive and clean; reload on activation. */
    needsReload: boolean;
  }
  export interface Tab {
    id: string;
    /** null while this tab is the active one (its live state is in the document store). */
    snapshot: TabSnapshot | null;
  }
  interface TabsState {
    tabs: Tab[];
    activeId: string;
    openInTab: (path: string) => Promise<boolean>;
    newTab: () => Promise<void>;
    activate: (id: string) => Promise<void>;
    close: (id: string) => Promise<boolean>;
    confirmCloseAll: () => Promise<boolean>;
    move: (from: number, to: number) => void;
    onInactiveFileChanged: (e: FileChangedEvent) => void;
  }
  ```
  Give every action a one-line JSDoc in the interface (look at `DocumentState` for the style).
  Tab ids come from a module counter: `` `tab-${++tabCounter}` ``. Initial state: one tab
  `{ id: 'tab-1', snapshot: null }` (from the counter) with `activeId` set to it.
- [ ] **B2. Private helpers** (module functions, not exported unless a test needs them):
  - `pathOf(tab: Tab): string | null`: the snapshot's `doc.path`, or for the active tab
    `useDocumentStore.getState().path`.
  - `docOf(tab: Tab): DocFields`: the same idea for the whole document.
  - `captureActive(): TabSnapshot`:
    `{ doc: pickDocFields(useDocumentStore.getState()), viewMode: useSettingsStore.getState().viewMode, topLine: useViewStore.getState().topLine, needsReload: false }`.
  - `showSnapshot(snap: TabSnapshot): Promise<void>`: puts a snapshot on screen:
    1. `await setAssetRoot(snap.doc.path ? dirname(snap.doc.path) : null).catch(() => undefined);`
       (comment: best effort; a failure only breaks relative images). Do this **first**, so the
       preview's image requests go to the right folder.
    2. `useViewStore.getState().setFindOpen(false)`, then `setTopLine(snap.topLine)`.
    3. `useDocumentStore.setState(snap.doc)`.
    4. `useSettingsStore.getState().set('viewMode', snap.viewMode)`.
    5. If `snap.topLine > 0`, `useViewStore.getState().requestScrollToLine(snap.topLine)`.
    6. If `snap.needsReload && !isDirty(snap.doc)`, `await useDocumentStore.getState().reload()`.
    Guard every Tauri call with `isTauri()` as `document.ts` does (tests mock `isTauri: () => true`).
- [ ] **B3. `activate(id)`.** Return early if `id === activeId` or the id doesn't exist. Otherwise:
  take `const outgoing = captureActive()` and the incoming snapshot, then **in one `set`** give the
  outgoing tab `snapshot: outgoing`, the incoming tab `snapshot: null`, and `activeId: id`. Then
  `await showSnapshot(incoming)`.
- [ ] **B4. `openInTab(path)`.**
  1. If a tab already has this file (`findTabByPath` over `tabs.map(t => ({ id: t.id, path: pathOf(t) }))`),
     `await activate(thatId)` and return `true`.
  2. If the active document is blank (`isBlankDocument(useDocumentStore.getState())`), load into
     it: `const ok = await useDocumentStore.getState().load(path)`. If `ok`, set `viewMode` to
     `'formatted'`. Return `ok`.
  3. Otherwise create a new tab after the active one: capture the outgoing snapshot, insert
     `{ id: newId, snapshot: null }` right after the active tab, set `activeId: newId`, then
     `await showSnapshot({ doc: { ...EMPTY_DOC, loadId: nextLoadId() }, viewMode: 'formatted', topLine: 0, needsReload: false })`,
     then `const ok = await useDocumentStore.getState().load(path)`.
     If `!ok`, keep the error message (`useDocumentStore.getState().error`), remove the new tab,
     put the previous tab back on screen (its snapshot → `showSnapshot`, set it active, its
     snapshot → null), and then `useDocumentStore.setState({ error })` so the user sees why. Return `ok`.
- [ ] **B5. `newTab()`.**
  - If the active document has **no** document (`!hasDocument`, the start screen), don't add a tab:
    `await useDocumentStore.getState().newDocument()` then set `viewMode` to `'source'`.
  - Otherwise add a tab after the active one (as in B4.3) and show
    `{ doc: { ...EMPTY_DOC, hasDocument: true, loadId: nextLoadId() }, viewMode: 'source', topLine: 0, needsReload: false }`.
- [ ] **B6. `close(id)`.** Returns `false` if the user cancels.
  1. Unknown id → return `false`.
  2. If `id !== activeId` and that tab's snapshot is dirty (`isDirty(snapshot.doc)`),
     `await activate(id)` first, so the user sees what they're being asked about. Carry on with it
     as the active tab.
  3. If `id !== activeId` (and clean), remove it from `tabs`, unwatch its path if it has one
     (`unwatchFile(path).catch(() => undefined)`, comment why that's safe), and return `true`.
  4. Active tab: `if (!(await useDocumentStore.getState().confirmDiscard())) return false;`.
     Remember its path, then compute `next = nextActiveAfterClose(ids, id, activeId)`.
     - If `next` exists, take its snapshot, `set` tabs without the closed tab, with
       `activeId: next` and next's snapshot set to `null`, then `await showSnapshot(thatSnapshot)`.
       **Don't** capture the closing tab.
     - If `next` is `null` (it was the last tab), replace the tab list with one new tab id and
       `await showSnapshot({ doc: { ...EMPTY_DOC, loadId: nextLoadId() }, viewMode: 'formatted', topLine: 0, needsReload: false })`
       (the start screen).
     - Unwatch the closed tab's path, if any.
     - Return `true`.
- [ ] **B7. `confirmCloseAll()`.** For each tab, in order: if its document is dirty (active →
  `isDirty(useDocumentStore.getState())`; inactive → `isDirty(snapshot.doc)`), `await activate(id)`
  then `if (!(await useDocumentStore.getState().confirmDiscard())) return false;`. Return `true` at
  the end. It doesn't remove any tabs; the window is about to close.
- [ ] **B8. `move(from, to)`.** `set({ tabs: moveItem(tabs, from, to) })`.
- [ ] **B9. `onInactiveFileChanged(e)`.** Find the **inactive** tab whose snapshot's `doc.path` is
  `samePath` with `e.path`. If there isn't one, return. Otherwise update that snapshot immutably:
  - `e.removed` → `doc.externalChange = 'removed'`.
  - `e.mtime === doc.mtime` → do nothing (our own save).
  - dirty → `doc.externalChange = 'modified'`.
  - clean → `needsReload = true`.
- [ ] **B10. Save-target guard.** At module level, after the store is created, call
  `setSaveTargetGuard((target) => …)`: find an **inactive** tab with `samePath(path, target)`. If
  there isn't one, `'ok'`. If it's clean, remove it from `tabs` (**don't** unwatch: the saving tab
  is about to watch the same file) and return `'ok'`. If it's dirty, return `'blocked'`.
- [ ] **B11.** Import only what you need: `create` from zustand; `DocFields`, `EMPTY_DOC`,
  `isDirty`, `nextLoadId`, `pickDocFields`, `setSaveTargetGuard`, `useDocumentStore` from
  `@/store/document`; `useSettingsStore`, `ViewMode` from `@/store/settings`; `useViewStore`; and
  `dirname`, `isTauri`, `setAssetRoot`, `unwatchFile`, `FileChangedEvent` from `@/lib/tauri`, plus
  the Phase 3 helpers.

### C. `src/store/tabs.test.ts`

Copy the mock setup from the top of `document.test.ts`: `@/lib/tauri` with `isTauri: () => true`
and mocked `readFile` / `writeFile` / `watchFile` / `unwatchFile` / `setAssetRoot`,
`@tauri-apps/plugin-dialog`, and `askSaveChanges`. Add a `@tauri-apps/plugin-dialog` `save` mock
you can control for the Save As test. In `beforeEach`: `vi.clearAllMocks()`, reset the document
store to `EMPTY_DOC`, set `viewMode: 'formatted'` in the settings store, set `topLine: 0` in the
view store, and reset the tabs store to a single fresh tab (export a small test-only
`resetTabsForTest()`, **or** `useTabsStore.setState({ tabs: [{ id: 't0', snapshot: null }], activeId: 't0' })`,
the second is preferred). Make `readFile` return a different content per path (e.g. `# ${path}`).

- [ ] **C1.** Opening A then B gives two tabs, B active and on screen. `activate(A)` brings back A's
  content. The `viewMode` and `topLine` A had when it was left are restored (set them on the
  settings and view stores before opening B).
- [ ] **C2.** Opening A while the start screen is showing reuses the tab (still one tab).
- [ ] **C3.** Opening A again, including as `c:/…/A.MD` with different case and slashes, activates
  the existing tab and doesn't call `readFile` again.
- [ ] **C4.** `newTab()` on the start screen doesn't add a tab. After a file is open it adds an
  untitled tab in `'source'` view.
- [ ] **C5.** Closing a clean inactive tab removes it without asking (`askSaveChanges` not called)
  and unwatches its path.
- [ ] **C6.** Closing a dirty inactive tab activates it, then asks. On cancel (`askSaveChanges`
  resolves `null`) the tab is still there and `close` returns `false`.
- [ ] **C7.** Closing the active middle tab activates the tab to its right. Closing the last
  remaining tab leaves one tab on the start screen (`hasDocument: false`).
- [ ] **C8.** `confirmCloseAll` with two dirty tabs asks twice and returns `true` on discard/discard.
  With discard/cancel it returns `false`.
- [ ] **C9.** `onInactiveFileChanged`: same `mtime` → nothing; clean → `needsReload`, and activating
  calls `readFile` again (reload); dirty → the snapshot's `externalChange` is `'modified'` and it
  shows after activation; `removed` → `'removed'`.
- [ ] **C10.** Switching tabs calls `setAssetRoot` with the incoming file's folder, and with `null`
  for an untitled tab.
- [ ] **C11.** A failed open in a new tab (`readFile` rejects) removes that tab, the previous tab is
  back on screen, and `error` is set.
- [ ] **C12.** Save As onto a path open in another **dirty** tab is blocked (no `writeFile`, error
  set). Onto a **clean** one, it writes and the other tab is removed.
- [ ] **C13.** `move(0, 1)` reorders tabs.

## Verify

- [ ] `pnpm test` (all tests, including the untouched `document.test.ts`), `pnpm lint`,
  `npx tsc --noEmit` pass.
- [ ] `git status`: only `document.ts`, `tabs.ts`, `tabs.test.ts`, this phase document (and
  `document.test.ts` only if you had to adjust it for the new API; explain in the Report).
- [ ] No manual app check in this phase: nothing in the UI uses the store yet.
- [ ] Commit: `Add a tabs store that swaps the active document`.

## Report

_(Fill in: any place where you had to deviate, and why.)_
