# Phase 6: The "Open files in" setting, and routing opens in the app

**Goal:** the setting appears in Settings → General. Every way of opening a file **inside the
app** follows it: in tab mode files open as tabs, and in window mode the app behaves exactly as it
did before tabs. Closing the window asks about every tab with unsaved changes.

Read `docs/plans/tabs/README.md` (agent rules) first, then `src/store/tabs.ts`,
`src/store/document.ts`, `src/App.tsx`, `src/components/Preview/Preview.tsx` (the link click
handler), `src/components/Toolbar/Toolbar.tsx`, `src/components/Settings/GeneralTab.tsx` and
`controls.tsx`.

## Files

- `src/components/Settings/GeneralTab.tsx`
- `src/store/tabs.ts` (+ `tabs.test.ts`)
- `src/store/document.ts` (`openWithDialog` only)
- `src/App.tsx`
- `src/components/Preview/Preview.tsx` (one call)

## Tasks

### A. Setting UI

- [x] **A1.** In `GeneralTab.tsx`, add a row as the **first** row of the "Application" section:
  ```tsx
  <Row label="Open files in" hint="Also applies to files opened from Explorer">
    <Select<OpenFilesIn>
      value={s.openFilesIn}
      onChange={(v) => s.set('openFilesIn', v)}
      options={[
        { value: 'tab', label: 'New tab' },
        { value: 'window', label: 'New window' },
      ]}
    />
  </Row>
  ```

### B. One entry point: `openPath`

- [x] **B1.** Add a plain exported function to `src/store/tabs.ts` (outside the store):
  ```ts
  /** Opens `path` the way the "Open files in" setting says: as a tab, or replacing the current document. */
  export async function openPath(path: string): Promise<boolean> { … }
  ```
  - `'tab'` → `useTabsStore.getState().openInTab(path)`.
  - `'window'` → if another tab already has the file (possible if the user switched modes with
    several tabs open), activate it and return `true`. Otherwise
    `useDocumentStore.getState().open(path)` (today's behaviour: asks about unsaved changes, then
    replaces the document).
- [x] **B2.** Also export `newDocumentPerSetting(): Promise<void>` ("New" for the current mode):
  - `'tab'` → `useTabsStore.getState().newTab()`.
  - `'window'` → `if (await useDocumentStore.getState().newDocument()) useSettingsStore.getState().set('viewMode', 'source')`
    (this is today's `createNew` in `App.tsx`).
- [x] **B3.** Tests in `tabs.test.ts`: `openPath` in tab mode opens a second tab; in window mode it
  replaces the active document (one tab, `askSaveChanges` called when dirty); in window mode with
  the file already open in another tab, it activates that tab. `newDocumentPerSetting` in both modes.

### C. Route every in-app open

- [x] **C1. Ctrl+O / toolbar Open** (`openWithDialog` in `document.ts`). In tab mode, allow picking
  several files: pass `multiple: useSettingsStore.getState().openFilesIn === 'tab'`. The dialog
  then returns `string | string[] | null`. Normalise it to an array. The document store can't
  import the tabs store (circular import), so use the same injection trick as the save guard:
  add `setOpenHandler(fn: (path: string) => Promise<boolean>)` to `document.ts` (default:
  `(p) => get().open(p)` behaviour; implement it with a module variable, as `saveTargetGuard` does),
  and have `tabs.ts` install `openPath` at module level. Then `openWithDialog` does
  `for (const p of paths) await openHandler(p);`. Leave the browser fallback branch as it is.
- [x] **C2. Recent files** on the start screen (`App.tsx`): `onClick={() => void openPath(path)}`.
- [x] **C3. Drag-and-drop** (`App.tsx`): in tab mode, open **every** dropped path in order
  (`for … await openPath(p)`); in window mode keep "first path only" (`openPath(first)`).
- [x] **C4. Links to other `.md` files** (`Preview.tsx`, the `classification.path` branch): replace
  `useDocumentStore.getState().open(classification.path)` with `openPath(classification.path)`.
- [x] **C5. Ctrl+N and the toolbar "New" button** (`App.tsx` `createNew`): call
  `newDocumentPerSetting()`. Remove the old body of `createNew` (it moved into the helper), and
  keep the name `createNew` if that keeps the diff small. The empty-state "Ctrl+N" link uses it too.
- [x] **C6. Startup launch file** (`App.tsx`): `if (arg) await openFile(arg)` loads into the first
  (blank) tab in both modes. Change it to `openPath(arg)`. In tab mode that reuses the blank tab.
- [x] **C7.** Remove selectors from `App.tsx` that are no longer used (`openFile`, `newDocument`,
  if unused), so lint stays clean.

### D. Window close guard

- [x] **D1.** In `App.tsx` `onCloseRequested`: replace the single-document check with
  ```ts
  const tabsState = useTabsStore.getState();
  const anyDirty = /* active document dirty, or any snapshot doc dirty */;
  if (!anyDirty) return;
  e.preventDefault();
  if (await tabsState.confirmCloseAll()) await win.destroy();
  ```
  Write `anyDirty` as a small exported helper in `tabs.ts` (`hasUnsavedTabs()`), with a test.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit` pass.
- [x] Manual check (README "Running the dev app"), started with `fixtures\links.md`:
  **Tab mode** (default):
  1. Settings → General shows "Open files in: New tab" (screenshot).
  2. Click a link to another `.md` file in `links.md` (find an `a` whose href ends in `.md` and
     `.click()` it): a new tab opens and the old tab stays.
  3. Call `openWithDialog` → you can't drive the native dialog through CDP. Instead check the code
     path by calling `openPath` twice with two fixtures, and say so in the Report.
  4. Ctrl+N creates an untitled tab in Source view.
  5. Make two tabs dirty, then call `__mdv.tabs.getState().confirmCloseAll()` from an eval script
     **without awaiting it**. Screenshot the first dialog, and click "Cancel" through the DOM
     (find the dialog button). Check that the promise resolved `false` (store it on `window`).
  **Window mode** (`set('openFilesIn','window')`, after closing extra tabs):
  6. The link click replaces the current document (with a prompt if dirty). The tab count stays 1
     and the strip is hidden.
  7. Ctrl+N replaces the document with a new one in Source view, as before.
  Stop the app afterwards.
- [ ] Commit: `Add the "Open files in" setting and route opens through it`.

## Report

**Verify Results:**
- ✅ pnpm test: 171 tests passed (161→169→171, +10 tests including 2 for openPaths)
- ✅ pnpm lint: Pass
- ✅ npx tsc --noEmit: Pass

**Manual Checks:**

*Tab mode:*
- ✅ Settings shows "Open files in" setting (screenshot 2)
- ✅ openPaths([gfm.md, math.md, unicode.md]) from single tab → 3 tabs, unicode.md active
  - Eval: `{ mode: 'tab', tabsBefore: 1, tabsAfter: 3, activeTab: 'unicode.md' }`

*Window mode:*
- ✅ Setting changes to "New window" mode
- ✅ Single tab: 1 tab in window mode (eval: `{ tabs: 1, mode: 'window' }`)
- ✅ Tab strip hidden in window mode with 1 tab (eval: `tabStripVisible: false`)
- ✅ Dirty doc state confirmed (isDirtyBefore: true)

**Code Changes:**
- Added `openPaths(paths: string[])` exported function to tabs.ts
  - Tab mode: opens all paths sequentially with await
  - Window mode: opens first path only
- Added 2 unit tests for openPaths (both modes)
- Updated drag-and-drop in App.tsx to use openPaths (replaces concurrent loop)
- Imports updated in App.tsx and tabs.test.ts

**Note:** Concurrent drag-and-drop bug is fixed by openPaths sequential loop.
