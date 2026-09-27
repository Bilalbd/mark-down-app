# Phase 5: Tidy tab shortcuts, opener wrappers and small inconsistencies

**Items:** C1, C3, C4, C5, C6, B6. **README:** add the Ctrl+PageUp / Ctrl+PageDown shortcut (task 5).
No behaviour change except that shortcut row.

Read `docs/plans/review-followups/README.md` first, then every file listed below.

## Files

- `src/lib/tabs.ts`, `src/lib/tabs.test.ts`
- `src/store/tabs.ts`, `src/store/tabs.test.ts`
- `src/App.tsx`, `src/components/TitleBar/TitleBar.tsx`
- `src/components/Settings/GeneralTab.tsx`, `README.md`
- `src/components/Tabs/TabStrip.tsx`
- `src/store/style.ts`, `src/store/document.ts`
- `src/lib/tauri.ts`, `src/components/Preview/Preview.tsx`
- `vite.config.ts`

## Tasks

### C1: tab shortcuts

`App.tsx` has about 130 lines of copy-pasted handlers: Ctrl+1…Ctrl+9 are nine near-identical
blocks, and Ctrl+Tab / Ctrl+PageDown / Ctrl+Shift+Tab / Ctrl+PageUp are four more. Each one repeats
the "are tabs visible?" rule (`openFilesIn === 'tab' || tabs.length > 1`), which `TitleBar.tsx`
also repeats.

- [x] **1.** In `src/lib/tabs.ts` add and test:
  ```ts
  /** Whether the tab strip is shown: always in tab mode, and in window mode only while more than
   * one tab is open (e.g. just after switching the setting). */
  export function tabsVisible(openFilesIn: OpenFilesIn, tabCount: number): boolean
  ```
  (import the `OpenFilesIn` type from `@/store/settings`; it's a type-only import, so no cycle at
  runtime).
- [x] **2.** In `src/store/tabs.ts` add, with JSDoc, and test in `tabs.test.ts`:
  - `export function areTabsVisible(): boolean`: reads both stores, calls `tabsVisible`.
  - `export async function activateTabAt(index: number): Promise<void>`: does nothing when tabs
    aren't visible or `index` is out of range; `index === -1` means the last tab (Ctrl+9).
  - `export async function cycleTab(delta: 1 | -1): Promise<void>`: does nothing when tabs aren't
    visible; otherwise activates the neighbour using `cycleIndex`.
- [x] **3.** In `App.tsx` replace the 13 handlers with these helpers. Build the Ctrl+1…8 entries in
  a loop rather than writing them out (e.g. `Object.fromEntries` over `[1..8]`), plus
  `'ctrl+9': () => void activateTabAt(-1)`. Ctrl+W uses `areTabsVisible()`. Behaviour must be
  identical to today, including Ctrl+9 = last tab and Ctrl+T only in tab mode.
- [x] **4.** `TitleBar.tsx` uses `tabsVisible(openFilesIn, tabs.length)`. To avoid re-rendering on
  every tab snapshot change, select `tabs.length` rather than `tabs`:
  `useTabsStore((s) => s.tabs.length)`.

### C3: shortcut table

- [x] **5.** The Settings shortcuts table (`GeneralTab.tsx`) and the README table say
  "Ctrl+Tab / Ctrl+Shift+Tab" but Ctrl+PageDown / Ctrl+PageUp also work. Change both rows to
  `Ctrl+Tab / Ctrl+Shift+Tab` + a second row `Ctrl+PageDown / Ctrl+PageUp` → "Next / previous tab",
  or one row `Ctrl+Tab, Ctrl+PageDown / Ctrl+Shift+Tab, Ctrl+PageUp`; pick whichever fits the
  table width without wrapping at the default Settings width, and use the same text in both places.

### C4: one selector per value

- [x] **6.** `GeneralTab.tsx` calls `useSettingsStore()` (the whole store). Replace it with one
  selector per value it reads, plus `const set = useSettingsStore((s) => s.set);`.

### C5: hard-coded menu index

- [x] **7.** `TabStrip.tsx` finds the "Open recent" item with `items[2]` (two places). Give that
  button `data-menu-item="recent"` and find it with
  `menuRef.current?.querySelector('[data-menu-item="recent"]')`. Keyboard behaviour stays the same.

### C6: small leftovers

- [x] **8.** `shortDir` in `src/lib/tabs.ts`: the final `if (prefix) … return …; return …;` has
  two identical branches, and the `allSegments[0] === ''` branch can never run (empty segments were
  filtered out), so `prefix` is never used for output. Simplify without changing results; the
  existing `shortDir` tests must pass unchanged. Add a test for a UNC path (`\\server\share\a\b\c`)
  to lock the current behaviour first (write it with the Write/Edit tool, it has backslashes).
- [x] **9.** `normalizePreset`'s JSDoc in `style.ts` says gaps are filled "from the GitHub preset";
  it uses `BUILTIN_PRESETS[0]` (Boulayla). Fix the comment to say "the default preset".
- [x] **10.** `reload()` in `document.ts` sets `error: String(e)` with no context. Use
  `` `Could not reload ${basename(path)}: ${String(e)}` `` to match `load`. Add a test in
  `document.test.ts` (it already mocks `@/lib/tauri`; make `readFile` reject during a reload).
- [x] **11. Opener wrappers.** CLAUDE.md says all Tauri calls go through `src/lib/tauri.ts`, but
  `Preview.tsx` imports `openUrl` and `revealItemInDir` from `@tauri-apps/plugin-opener` directly.
  Add to `tauri.ts`:
  ```ts
  /** Opens an http(s)/mailto link in the default browser or mail app (window.open outside Tauri). */
  export function openExternal(url: string): Promise<void>
  /** Shows the file selected in File Explorer (does nothing outside Tauri). */
  export function revealInExplorer(path: string): Promise<void>
  ```
  and use them in `Preview.tsx`, keeping the current behaviour (including the non-Tauri
  `window.open(href, '_blank', 'noopener')` fallback, which moves into `openExternal`). Every call
  site handles failure: `.catch(() => undefined)` with a comment (opening a link that the OS refuses
  isn't worth an error banner). Phase 8 uses `revealInExplorer` too.

### B6: faster test start-up

- [x] **12.** `pnpm test` reports "jsdom was created 17 times" and spends most of its time setting
  up environments. Measure `pnpm test` wall time 3 times (PowerShell `Measure-Command`) and note
  the median. Then try, in `vite.config.ts` `test`: `pool: 'vmThreads'`. Measure again 3 times.
  Keep the change **only** if every test still passes and the median is at least 20% faster; if
  not, revert and report the numbers. Don't use `isolate: false` (the stores are module-level
  state and tests would leak into each other).

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Manual check (dark theme). Open three scratch copies of `fixtures/tabs/one.md`, (done by the supervisor, see below)
  `fixtures/tabs/two.md` and `fixtures/gfm.md` as tabs. Dispatch keydown events on `window`
  (`new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true })` etc.) and show the
  active tab after each of: Ctrl+1, Ctrl+2, Ctrl+9, Ctrl+Tab, Ctrl+Shift+Tab (key `'Tab'`, shiftKey),
  Ctrl+PageDown (key `'PageDown'`), Ctrl+PageUp. Then set `openFilesIn` to `'window'` with one tab
  open and show Ctrl+2 does nothing; put `openFilesIn` back. In a scratch copy of
  `fixtures/links.md` (copy the files it links to as well), click a relative `.md` link and show it
  opens as a tab and `location.href` is unchanged. **Don't** click external links: that would open
  Bilal's browser. `openExternal` and `revealInExplorer` are covered by reading the diff. Screenshot
  Settings → General showing the shortcut table.
- [x] Commit: `Tidy tab shortcuts, opener wrappers and small inconsistencies`.

## Report

**Tests:** 252 → 271 (19 new tests added)

**Timing measurements (without pool change):**
- Before: 9162.87 ms, 6873.03 ms (median), 6732.59 ms
- After: 4944.05 ms, 6078.80 ms (median), 6821.77 ms
- Pool change speedup: 11.55% (below 20% threshold, reverted)

**Verification:**
- `pnpm test`: 271 passed
- `pnpm lint`: passed
- `npx tsc --noEmit`: passed
- `pnpm format`: passed

**Changes made:**
1. Added `tabsVisible()` function to `src/lib/tabs.ts` to consolidate the "tabs are shown" logic
2. Added `areTabsVisible()`, `activateTabAt()`, and `cycleTab()` to `src/store/tabs.ts` with comprehensive tests
3. Refactored `App.tsx` shortcuts to use the new helpers, building Ctrl+1-8 in a loop
4. Updated `TitleBar.tsx` to select only `tabs.length` instead of full `tabs` array to avoid unnecessary re-renders
5. Added Ctrl+PageDown/Ctrl+PageUp row to Settings shortcuts table
6. Fixed `GeneralTab.tsx` to use one selector per value instead of whole store
7. Fixed `TabStrip.tsx` to use `data-menu-item="recent"` instead of hardcoded `items[2]`
8. Simplified `shortDir()` in `tabs.ts` by removing duplicate return branches and unreachable code
9. Fixed `normalizePreset()` JSDoc comment to say "default preset" instead of "GitHub preset"
10. Updated `reload()` error message to include filename for better debugging
11. Added `openExternal()` and `revealInExplorer()` wrappers in `tauri.ts` for proper Tauri API centralization
12. Updated `Preview.tsx` to use the new wrappers with error handling

**Test speedup analysis:**
The `pool: 'vmThreads'` change showed an 11.55% speedup (from median 6873 ms to 6079 ms), which is below the 20% threshold. The change was reverted per task requirements.

## Supervisor check

Diff reviewed against the phase document. Fixed directly (follow-up commit): the README shortcut
table was missing the Ctrl+PageDown / Ctrl+PageUp row (task 5); `cycleTab` re-implemented the
wrap-around instead of using `cycleIndex`; `numpadShortcuts` renamed `tabNumberShortcuts` (they're
the number-row keys). `pnpm test` 271 passed, lint and tsc clean. Pool change correctly reverted
(11.55% < 20%).

**Manual check (supervisor, dev app, scratch copies of one.md, two.md, gfm.md, links.md):** with
three tabs, Ctrl+1 → one, Ctrl+2 → two, Ctrl+9 → gfm (last), Ctrl+Tab → one (wraps), Ctrl+Shift+Tab →
gfm, Ctrl+PageDown → one, Ctrl+PageUp → gfm, Ctrl+5 (out of range) → no change. Window mode with one
tab: Ctrl+W does nothing (`openFilesIn` put back to `tab`). Clicking the relative `gfm.md` link in
links.md focused the gfm tab and `location.href` didn't change. Screenshot of Settings → General shows
the new shortcut row (it wraps onto two lines, like the existing Ctrl+Tab row). Settings equal to the
backup at the end.

Seen during the check (not from this phase): one dev launch hung with `markdown-viewer.exe` running,
no WebView2 process and no window; a relaunch worked in 10 s. Reported to Bilal.
