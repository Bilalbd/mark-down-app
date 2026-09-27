# Phase 1: Smaller "+" tab button, and a stronger active line

Two small visual tweaks. The "+" button at the end of the tab row is bigger than the tab's close
button (a 28 × 24 px hover square); make it match the close button. In the source editor, the
highlighted current line is hard to see; raise its contrast a little.

## Files

- `src/components/Tabs/TabStrip.css`
- `src/components/Tabs/TabStrip.tsx` (only the `<Plus>` icon props)
- `src/components/Editor/editorTheme.ts`

No README change.

## Tasks

### "+" button

- [ ] **1.** `.tabstrip__new`: 18 × 18 px, `border-radius: 4px`, same hover background as
  `.tabstrip__close` (`var(--chrome-hover)`), vertically centred in the tab row. Keep the margin so
  it doesn't touch the last tab (about 4px each side). Keep `.is-active` (menu open) showing the hover
  background.
- [ ] **2.** Draw the icon at 14 px, the same as the close button: `<Plus size={14} strokeWidth={1.75}
  absoluteStrokeWidth />` (or spread `ICON` with `size: 14`, like `MENU_ICON`). Don't change the
  menu or its behaviour. The dropdown must still open directly under the button.

### Active line

- [ ] **3.** In `editorTheme.ts`:
  - `.cm-activeLine`: `color-mix(in srgb, var(--content-fg) 7%, transparent)` (was 4%).
  - `.cm-activeLineGutter`: the same 7% background (so line number and line read as one band), and
    `color: var(--content-fg)` (was 90% of the muted colour). Keep the weight at 400.
- [ ] **4.** Make sure the selection colour still shows on the active line (the selection layer is
  drawn over it; just check it visually).

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check in **light and dark**:
  - Tab row with two tabs: crop and enlarge the close button of the active tab and the "+" button
    side by side. Same size box, same icon size. CDP can't hover, so open the menu (click the "+"
    from eval, which adds `.is-active`) to show the hover square, then screenshot.
  - Source view on a copy of `fixtures/gfm.md` with the cursor on a middle line: the active line and
    its number are clearly visible but still subtle. Select a word on that line: the selection is
    visible.
- [ ] Commit: `Shrink the new-tab button and strengthen the active line`.

## Report

_(agent fills in: what changed, test counts before/after, screenshots and what they show, anything
skipped)_

## Supervisor check

_(supervisor fills in)_
