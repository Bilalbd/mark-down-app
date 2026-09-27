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

- [ ] **1.** Move the zoom maths into the settings store module as exported functions with JSDoc
  and tests: `zoomPreviewBy(delta: number)` (clamps to 0.5–3 and rounds to 2 decimals) and
  `resetPreviewZoom()`. `App.tsx` uses them; the shortcuts behave exactly as before. Tests: step
  up/down, clamping at both ends, rounding (0.1 steps never produce 1.2000000002).
- [ ] **2.** In `Preview.tsx`, add a `wheel` listener on the scroll element with
  `{ passive: false }` (React's `onWheel` is passive, so attach it in an effect with
  `addEventListener` and remove it on cleanup). When `e.ctrlKey`: `preventDefault()` and zoom by
  `-Math.sign(e.deltaY) * 0.1`. Without Ctrl, scrolling is untouched. A precision touchpad sends
  many small wheel events per pinch: accumulate `deltaY` and step once per 100 units of delta (and
  once per event for normal mouse wheels, which send ≥100). Put that accumulator in a small pure
  helper with a test.
- [ ] **3.** Split view: the wheel zoom works on the preview pane only; Ctrl+wheel over the editor
  keeps doing nothing (check CodeMirror doesn't do something odd; report what you see).

### Clear recent files

- [ ] **4.** `clearRecentFiles()` in the settings store (JSDoc; test).
- [ ] **5.** Start screen: next to the "Recent" title, a small text button **Clear** (use the
  existing `.link-button` style at the title's font size, aligned right on the title row). It asks
  nothing (recent files aren't documents).
- [ ] **6.** Open recent flyout (`+` menu): when the list isn't empty, a separator and a last item
  **Clear recent files** (`role="menuitem"`). Keyboard navigation over the flyout items still works
  and includes it. After clearing, the flyout shows "No recent files".
- [ ] **7.** Tokens only; both themes.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check, **both themes**. Read `previewZoom` and the recent-files **list** first (keep
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
- [ ] Commit: `Zoom the preview with Ctrl+wheel and add Clear recent files`.

## Report

(fill in: tests before → after, zoom values, recent-files count before/after, screenshot paths)
