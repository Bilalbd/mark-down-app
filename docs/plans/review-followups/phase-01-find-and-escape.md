# Phase 1: Keep the find match while editing, and close one layer per Escape

**Items:** A1, A3. **README:** no change.

Read `docs/plans/review-followups/README.md` first, then every file listed below.

## A1: the find bar jumps back to match 1 on every edit

**What happens:** with the find bar open in Split view, every edit re-renders the preview. The
search effect in `FindBar.tsx` (around line 55–80) re-runs because `previewVersion` and `content`
changed, and it calls `setIndex(0)` and `setCurrentPreviewMatch(found, 0)`. The second call scrolls
match 1 into view, so the preview jumps away from where you were.

**Wanted:** the index resets to 0 (and scrolls) only when the **search itself** changes (query,
match case, or switching between preview and editor search). When only the document changes, keep
the same index (clamped to the new number of matches), update the highlight, and **don't scroll**.

### Files

- `src/lib/previewFind.ts`, `src/lib/previewFind.test.ts`
- `src/components/Find/FindBar.tsx`

### Tasks

- [ ] **1. Pure helper** in `previewFind.ts`:
  ```ts
  /** The match index to show after a re-search: kept (clamped) when only the document changed,
   * reset to 0 when the search itself changed. */
  export function matchIndexAfterSearch(
    prevIndex: number,
    searchChanged: boolean,
    count: number,
  ): number
  ```
  Returns 0 when `searchChanged` or `count === 0`, otherwise `Math.min(prevIndex, count - 1)`.
- [ ] **2. Scroll option.** Give `setCurrentPreviewMatch` a third parameter
  `opts: { scroll?: boolean } = {}` (default scroll true). It only calls `scrollIntoView` when
  `opts.scroll !== false`.
- [ ] **3. FindBar.** Keep a ref with the key of the last search that ran:
  `` `${query}\u0000${caseSensitive}\u0000${usePreview}` `` (write this line with the Edit tool).
  In the search effect, compute `searchChanged = key !== lastKeyRef.current`, store the new key,
  then:
  ```ts
  const next = matchIndexAfterSearch(indexRef.current, searchChanged, found.length);
  setMatches(found);
  setIndex(next);
  setCurrentPreviewMatch(found, next, { scroll: searchChanged });
  ```
  `index` must not be added to the effect's dependencies (that would re-run the search on every
  Enter). Mirror it in a ref (`indexRef.current = index` on each render) and read the ref in the
  effect. Reset `lastKeyRef.current` to `''` when the bar closes, so reopening counts as a new search.
- [ ] **4. Tests** in `previewFind.test.ts`: `matchIndexAfterSearch` keeps the index when only the
  document changed, clamps when matches shrink, resets on a search change, returns 0 for no matches.
  Add a test that `setCurrentPreviewMatch(..., { scroll: false })` doesn't call `scrollIntoView`
  (jsdom may not have `CSS.highlights`; if `setCurrentPreviewMatch` returns early without it, stub
  `CSS.highlights` and `Highlight` on `globalThis` in the test and restore them afterwards).

## A3: one Escape closes two layers

**What happens:** `SettingsPanel` and `ConfirmDialog` both listen for Escape on `window` in the
capture phase. With Settings open, trigger a Save / Don't save dialog (for example, close a dirty
tab) and press Escape: **both** close. `stopPropagation` in the dialog doesn't stop another listener
on the same target, and the Settings listener was registered first, so it runs first anyway.

**Wanted:** Escape closes only the top-most layer. The dialog is always on top.

### Files

- `src/components/Settings/SettingsPanel.tsx`
- `src/components/Dialog/ConfirmDialog.tsx`
- New test: `src/components/Settings/SettingsPanel.test.tsx`

### Tasks

- [ ] **5.** In `SettingsPanel`'s Escape handler, return early (without closing and without stopping
  the event) when `useDialogStore.getState().current !== null`.
- [ ] **6.** In `ConfirmDialog`, use `e.stopImmediatePropagation()` as well as `stopPropagation()`
  for Escape (it's the top layer, so nothing else should also react).
- [ ] **7. Regression test** `SettingsPanel.test.tsx`. Render `<SettingsPanel />` and
  `<ConfirmDialog />` with `createRoot` from `react-dom/client` inside `act` (from `react`) into a
  container in `document.body`. Set `useSettingsStore.setState({ loaded: true })` and
  `useViewStore.setState({ settingsOpen: true })`. Start a dialog with
  `const p = useDialogStore.getState().show('T', 'M', [{ id: 'ok', label: 'OK' }])`, dispatch
  `new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })` on `window` inside `act`, then
  expect `await p` to be `null` (dialog cancelled) **and** `useViewStore.getState().settingsOpen` to
  still be `true`. A second Escape closes Settings. Unmount and reset the stores in `afterEach`.
  Set `globalThis.IS_REACT_ACT_ENVIRONMENT = true` at the top of the file. If the settings tabs pull
  in something jsdom can't handle, `vi.mock` that module and say so in the Report.
  Show the test failing without task 5.

## Verify

- [ ] `pnpm test` (227 → more), `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check, dark theme only (no visual change). Open a scratch copy of `fixtures/gfm.md`,
  switch to Split (`__mdv.settings.getState().set('viewMode','split')`), open find
  (`__mdv.view.getState().setFindOpen(true)`), type a query that matches several times (set the input
  value and dispatch an `input` event, or use `node scripts/cdp.mjs` to type), press Enter twice so
  the current match is 3. Record the preview's `scrollTop`. Then append text to the end of the
  document: `const d = __mdv.document.getState(); d.setContent(d.content + '\nx')`.
  Wait 500 ms. Show that the counter still says `3 of N` and `scrollTop` hasn't changed. Screenshot
  the find bar. Don't save the document.
- [ ] Commit: `Keep the find match while editing and close one layer per Escape`.

## Report

(fill in: tests before → after, the failing-then-passing output for tasks 4 and 7, manual-check
numbers, anything you did differently)
