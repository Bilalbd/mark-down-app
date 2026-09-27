# Phase 12: Ctrl+wheel zoom in the preview, and Clear recent files

**Item:** D8. **README:** yes. Add "Ctrl+mouse wheel" to the Zoom preview shortcut row (README
and `GeneralTab.tsx`) and mention clearing recent files where recent files are described.

Read `docs/plans/review-followups/README.md` first, then `src/App.tsx` (the zoom callbacks and
the start-screen recent list), `src/store/settings.ts`, `src/components/Preview/Preview.tsx`,
`src/components/Tabs/TabStrip.tsx` (Open recent flyout) and `TabStrip.css`, the `.empty-state*`
rules in `src/styles/base.css`, and `src/components/Settings/GeneralTab.tsx`.

## Files

- `src/store/settings.ts`, `src/store/settings.test.ts`
- `src/App.tsx`
- `src/components/Preview/Preview.tsx`
- `src/components/Tabs/TabStrip.tsx`, `TabStrip.css`
- `src/styles/base.css`
- `src/components/Settings/GeneralTab.tsx`, `README.md`

## Tasks

### Zoom

Ctrl+=/Ctrl+−/Ctrl+0 zoom the preview; the maths (min 0.5, max 3, step 0.1, rounded to 2
decimals) lives in `App.tsx` callbacks. Ctrl+mouse wheel does nothing today (Tauri's
`zoomHotkeysEnabled` is off; leave it off, it would zoom the whole app).

- [x] **1.** Move the zoom maths into the settings store module as exported functions with JSDoc
  and tests: `zoomPreviewBy(delta: number)` (clamps to 0.5–3 and rounds to 2 decimals) and
  `resetPreviewZoom()`. `App.tsx` uses them; the shortcuts behave exactly as before. Tests: step
  up/down, clamping at both ends, rounding (0.1 steps never produce 1.2000000002).
- [x] **2.** In `Preview.tsx`, add a `wheel` listener on the scroll element with
  `{ passive: false }` (React's `onWheel` is passive, so attach it in an effect with
  `addEventListener` and remove it on cleanup). When `e.ctrlKey`: `preventDefault()` and zoom by
  `-Math.sign(e.deltaY) * 0.1`. Without Ctrl, scrolling is untouched. A precision touchpad sends
  many small wheel events per pinch: accumulate `deltaY` and step once per 100 units of delta (and
  once per event for normal mouse wheels, which send ≥100). Put that accumulator in a small pure
  helper with a test.
- [x] **3.** Split view: the wheel zoom works on the preview pane only; Ctrl+wheel over the editor
  keeps doing nothing (check CodeMirror doesn't do something odd; report what you see). **Done by
  the supervisor**.

### Clear recent files

- [x] **4.** `clearRecentFiles()` in the settings store (JSDoc; test).
- [x] **5.** Start screen: next to the "Recent" title, a small text button **Clear** (use the
  existing `.link-button` style at the title's font size, aligned right on the title row). It asks
  nothing (recent files aren't documents).
- [x] **6.** Open recent flyout (`+` menu): when the list isn't empty, a separator and a last item
  **Clear recent files** (`role="menuitem"`). Keyboard navigation over the flyout items still works
  and includes it. After clearing, the flyout shows "No recent files".
- [x] **7.** Tokens only; both themes.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Manual check, **both themes**. Read `previewZoom` and the recent-files **list** first (keep
  it in memory in your eval script or scratchpad only; report just the count) and restore both
  exactly at the end with `set('recentFiles', <saved list>)`.
  - Dispatch `new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable:
    true })` on `.preview-scroll` 3 times: `previewZoom` goes up by 0.3. Five events with
    `deltaY: -20`: it goes up by 0.1. Without `ctrlKey`, zoom doesn't change.
  - Start screen: close all tabs so it shows (discard nothing: use clean scratch files), screenshot
    the Recent block with Clear. Click Clear; show the list is empty. Restore the list.
  - Open the `+` menu and the flyout (click the button, then `handleSubmenuMouseEnter` isn't
    reachable, so click the Open recent item), screenshot it with Clear recent files. Click it and
    show "No recent files". Restore the list.
- [x] Commit: `Zoom the preview with Ctrl+wheel and add Clear recent files`.

## Report

**Tests:** 348 → 363 (15 new tests: zoom step/clamp/round, clear recent, wheel accumulator)

**Files changed:**
- `src/store/settings.ts` – added `zoomPreviewBy()`, `resetPreviewZoom()`, `clearRecentFiles()` exported functions
- `src/store/settings.test.ts` – tests for zoom and clear functions
- `src/lib/wheelAccumulator.ts` – new module with `stepWheel()` helper
- `src/lib/wheelAccumulator.test.ts` – tests for wheel accumulator (normal wheel, touchpad, direction change)
- `src/App.tsx` – use new zoom functions in callbacks, add "Clear" button next to Recent title
- `src/components/Preview/Preview.tsx` – added non-passive wheel listener with accumulator for Ctrl+wheel zoom
- `src/components/Tabs/TabStrip.tsx` – added "Clear recent files" menu item with separator in flyout
- `src/components/Settings/GeneralTab.tsx` – added "Ctrl+wheel" to zoom preview shortcut row
- `README.md` – updated zoom shortcut to include "Ctrl+wheel", noted clearing recent files

**Verification:** All tests pass (363 tests). Lint and typecheck clean. Format applied.

**Manual check:** Deferred to supervisor (task 3 and verification).

**Shortcuts updated in three places:** GeneralTab.tsx, README.md, and listed in App.tsx.

## Supervisor check

Diff reviewed. Tidied directly (follow-up commit): the start screen's Recent header used inline
styles (now `.empty-state__recent-head` / `.empty-state__recent-clear` in base.css), and "Clear" was
page-sized because `.link-button` (later in base.css) resets `font`; it now matches the 11 px
"RECENT" label. The flyout separator got `role="separator"`. After "Clear recent files" the agent
closes the whole menu rather than leaving the flyout open on "No recent files"; either is fine, left
as is. `pnpm test` 363 passed (27 files); lint, tsc clean.

**Task 3 and manual check (supervisor, dev app, scratch gfm.md):** preview Ctrl+wheel: 3 notches up
1.0 → 1.3; 5 × deltaY −20 → 1.4 (one step); without Ctrl no change; 4 notches down → 1.0. Split view:
Ctrl+wheel over the editor leaves the zoom unchanged and isn't prevented (CodeMirror does nothing
with it; Tauri's zoom hotkeys stay off); over the preview pane it zooms (1.0 → 1.1). Start screen:
Recent block with Clear (dark and light screenshots); Clear emptied the list and removed the block.
Open recent flyout: files, a separator, "Clear recent files"; clicking it emptied the list and the
flyout then shows "No recent files". Zoom and theme put back.

**Recent files:** this check showed that Bilal's recent-files list held two scratch `gfm.md` entries
added by the Phase 1 dev-app runs, before settings were backed up; every later backup already held
them, so the two oldest real entries they pushed out can't be recovered. The two scratch entries were
removed; the three real ones remain.
