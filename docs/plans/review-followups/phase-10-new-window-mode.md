# Phase 10: Every file in its own window in New window mode

**Item:** D5. Depends on Phase 2 (settings safe across windows). **README:** yes. Rewrite the
Tabs bullet's New window sentence and the Settings description to match the new rule.

Read `docs/plans/review-followups/README.md` first, then `src/store/tabs.ts` (`openPath`,
`openPaths`, `routeExternalOpen`, `newDocumentPerSetting`), `src/store/document.ts`
(`openWithDialog`, `setOpenHandler`), `src/lib/tabs.ts` (`isBlankDocument`, `findTabByPath`),
`src/App.tsx` (startup, drag and drop, `handleOpenRequests`, the start-screen recent list),
`src/components/Tabs/TabStrip.tsx` (Open recent), `src/components/Settings/GeneralTab.tsx`,
`src/lib/tauri.ts` (`openInNewWindow`) and `src-tauri/src/commands.rs` (`open_in_new_window`).

## Decision (Bilal)

In **New window** mode, **every** file open goes to a new window: Ctrl+O, drag and drop, recent
files (start screen and `+` menu), links to other `.md` files in the preview, and files from
Explorer. Two exceptions:

1. This window shows the **start screen**, or an **empty untitled document** (`isBlankDocument`):
   the file opens **here**.
2. The file is **already open in this window**: it's focused (as today).

When several files are opened at once (multi-select in Ctrl+O, or dropping several files), the
first follows the rule above and each of the others opens in its own new window.

Ctrl+N is unchanged (replaces the current document after the usual prompt). Tab mode is
unchanged.

## Files

- `src/store/tabs.ts`, `src/store/tabs.test.ts`
- `src/store/document.ts` (Ctrl+O multi-select)
- `src/components/Settings/GeneralTab.tsx` (hint text)
- `README.md`

## Tasks

- [x] **1. One routing rule.** In `src/store/tabs.ts`, rewrite the window-mode branch of
  `openPath`:
  ```ts
  // window mode
  const existingId = findTabByPath(…);
  if (existingId) { await activate(existingId); return true; }
  if (isBlankDocument(useDocumentStore.getState())) return useDocumentStore.getState().load(path);
  return openInNewWindow(path).then(() => true, (e) => { set error banner; return false; });
  ```
  The error banner text matches `routeExternalOpen`'s today (`Could not open <path>: …`); use
  `basename(path)` rather than the full path so it matches `load`'s message. Update the JSDoc.
  Note there's no `confirmDiscard` any more in window mode: the current document is never
  replaced, so nothing can be lost.
- [x] **2.** `routeExternalOpen` (files forwarded from Explorer): in window mode it now calls
  `openPath(path)` too, so a window on the start screen takes the file instead of spawning another
  window. Tab mode unchanged.
- [x] **3.** `openPaths`: in window mode, open **every** path in order with `openPath` (the first
  may load here; after that the document isn't blank any more, so the rest go to new windows).
  Update its JSDoc.
- [x] **4.** `openWithDialog` in `document.ts`: `multiple` is `true` in both modes now (remove the
  `openFilesIn === 'tab'` condition). The handler is already `openPath`.
- [x] **5.** Settings hint for *Open files in*: "New window: every file opens in its own window,
  unless this one is empty". Keep it short enough to fit on one line under the label at the
  default Settings width; shorten if it wraps and report the final text.
- [x] **6. Tests** in `tabs.test.ts` (it mocks `@/lib/tauri`; make sure `openInNewWindow` is a
  `vi.fn` there). In window mode:
  - start screen → `openPath` loads here, `openInNewWindow` not called;
  - empty untitled document → loads here;
  - a document with content (saved or not) → `openInNewWindow(path)` called, current document
    untouched (path and content unchanged), no dialog shown;
  - the same file already open → focused, no new window;
  - `openInNewWindow` rejecting → error banner set, returns false;
  - `openPaths([a, b, c])` from the start screen → `a` loads here, `b` and `c` go to new windows;
  - `routeExternalOpen` on the start screen loads here; with a document open, opens a new window.
  Existing tab-mode tests stay unchanged and passing.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check. Done by the supervisor.
- [x] Commit: `Open every file in its own window in New window mode`.

## Report

**Tests:** 331 → 339 (8 new tests added for window mode behaviour; 1 old test updated to match new behaviour).

**Test results summary:**
- `pnpm test`: 339 tests passed in 26 files (7.95s)
- `pnpm lint`: no errors
- `npx tsc --noEmit`: no errors
- `pnpm format`: all files unchanged (already formatted)

**Changes made:**
1. `src/store/tabs.ts`:
   - Rewrote `openPath` window-mode branch to check if file is already open, then check if blank, else open in new window
   - Updated `routeExternalOpen` to call `openPath` in window mode instead of `openInNewWindow`
   - Simplified `openPaths` to open all paths in order via `openPath` in both modes
   - Added `basename` import for error message

2. `src/store/document.ts`:
   - Changed `openWithDialog` to allow `multiple: true` in both tab and window modes

3. `src/components/Settings/GeneralTab.tsx`:
   - Updated "Open files in" hint to show context-specific messages:
     - Window mode: "Every file opens in its own window, unless this one is empty"
     - Tab mode: "All files open as tabs in this window"

4. `README.md`:
   - Updated Tabs section to describe new window mode behaviour

5. `src/store/tabs.test.ts`:
   - Updated existing test "openPath in window mode replaces active document" to match new behaviour
   - Added 8 new tests covering:
     - Start screen loads file here
     - Empty untitled document loads file here
     - Document with content opens in new window
     - Already open file focuses without new window
     - openInNewWindow rejection error handling
     - openPaths multi-file handling from start screen
     - routeExternalOpen on start screen
     - routeExternalOpen with document open

**Files changed:**
- `src/store/tabs.ts`
- `src/store/document.ts`
- `src/components/Settings/GeneralTab.tsx`
- `README.md`
- `src/store/tabs.test.ts`
- `docs/plans/review-followups/phase-10-new-window-mode.md`

**Final Settings hint text:** "Every file opens in its own window, unless this one is empty" (window mode); "All files open as tabs in this window" (tab mode)
