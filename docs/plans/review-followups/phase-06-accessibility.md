# Phase 6: Keyboard-operable resizers, focus kept in dialogs, missing labels

**Item:** C7. **README:** no change.

Read `docs/plans/review-followups/README.md` first, then `src/components/Split/SplitView.tsx`
and `.css`, `src/components/Outline/Outline.tsx` and `.css`,
`src/components/Dialog/ConfirmDialog.tsx`, `src/components/Toolbar/Toolbar.tsx`,
`src/components/Toolbar/ExportMenu.tsx`, and `src/lib/scrollSync.ts` (for `clamp`).

## Files

- `src/components/Split/SplitView.tsx`, `SplitView.css`
- `src/components/Outline/Outline.tsx`, `Outline.css`, `Outline.test.ts`
- New: `src/lib/resize.ts`, `src/lib/resize.test.ts`
- `src/components/Dialog/ConfirmDialog.tsx`, new `src/components/Dialog/ConfirmDialog.test.tsx`
- `src/components/Toolbar/Toolbar.tsx`, `src/components/Toolbar/ExportMenu.tsx`

## Tasks

### Resizers

Today the split divider and the outline's resize edge only work with a mouse. Make both proper
keyboard-operable separators (the WAI-ARIA "window splitter" pattern).

- [ ] **1. Pure helper** `src/lib/resize.ts`:
  ```ts
  /** New size after a resize key, or null for keys that don't resize. Arrow keys move by `step`
   * (by `step * 5` with Shift); Home/End jump to `min`/`max`. The result is clamped. */
  export function resizeByKey(
    key: string,
    shift: boolean,
    value: number,
    opts: { min: number; max: number; step: number },
  ): number | null
  ```
  ArrowLeft decreases and ArrowRight increases. Tests cover each key, Shift, clamping at both ends,
  and an unrelated key returning null.
- [ ] **2. Split divider.** Add `tabIndex={0}`, `aria-label="Resize panes"`,
  `aria-valuemin={25}`, `aria-valuemax={75}`, `aria-valuenow={Math.round(ratio * 100)}`, and an
  `onKeyDown` that uses `resizeByKey` on the ratio with `step: 0.02`, `min: MIN_RATIO`,
  `max: MAX_RATIO`, calls `set('splitRatio', v)` (this persists) and `preventDefault`s when it
  handled the key. `aria-valuenow` describes the **first** pane's share, whichever side the editor
  is on.
- [ ] **3. Outline resize edge.** Same for `.outline__resizer`: `role="separator"`,
  `aria-orientation="vertical"`, `aria-label="Resize outline"`, `tabIndex={0}`,
  `aria-valuemin/max/now` in px, `step: 16`, `MIN_WIDTH`/`MAX_WIDTH`, `set('outlineWidth', v)`.
- [ ] **4. Focus style.** Both separators show a visible focus ring only on keyboard focus
  (`:focus-visible`): use `var(--accent)` the same way other focus rings in the app do (search the
  CSS for `focus-visible` and match it). Mouse dragging must look unchanged.

### Dialog focus

- [ ] **5.** In `ConfirmDialog`, keep Tab and Shift+Tab inside the dialog: on keydown `Tab`, if
  focus is on the last button (or first, with Shift), move to the first (or last) and
  `preventDefault`. When the dialog closes, return focus to the element that was focused when it
  opened (store `document.activeElement` when `current` becomes non-null; call `.focus()` on it if
  it's still in the document).
- [ ] **6. Test** `ConfirmDialog.test.tsx` (same `createRoot` + `act` setup as Phase 1's
  `SettingsPanel.test.tsx`; copy that pattern): Tab from the last button goes to the first,
  Shift+Tab from the first goes to the last, and focus goes back to a button outside the dialog
  after it closes.

### Missing labels

- [ ] **7.** Add `aria-label` to the icon-only toolbar buttons that only have `title`: the swap
  panes button (`aria-label="Swap panes"`), the theme button (`aria-label={`Theme: ${…}`}`, same
  text as its title without "(click to change)"), and the Export button (`aria-label="Export"`).
  Check the rest of `Toolbar.tsx`, `TitleBar.tsx` and `TabStrip.tsx` for other icon-only buttons
  without `aria-label` and list what you found in the Report (fix them only if they're buttons in
  these three files).

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check on a scratch copy of `fixtures/gfm.md`, **both themes**. Read `splitRatio` and
  `outlineWidth` first and restore them at the end.
  - Split view: focus the divider (`document.querySelector('.split__divider').focus()`), dispatch
    ArrowRight 3 times on it, show `splitRatio` grew by 0.06, Home → 0.25, End → 0.75. Screenshot
    showing the focus ring (crop and enlarge).
  - Outline: same with the resize edge, show `outlineWidth` changes by 16 per key.
  - Dialog: make the document dirty (`setContent`), trigger `__mdv.tabs.getState().close(id)` for
    the active tab **without awaiting**, then dispatch Tab on `document.activeElement` 3 times and
    show focus stays on the dialog's buttons (log `document.activeElement.textContent` each time).
    Cancel the dialog with Escape. Discard the edit afterwards.
- [ ] Commit: `Make resizers keyboard-operable and keep focus in dialogs`.

## Report

(fill in: tests before → after, eval output, settings values before/after, other unlabelled buttons
found)
