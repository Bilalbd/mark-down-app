# Part A: New file / Open file menu on the + button

**Goal:** the `+` button at the end of the tab strip (title bar) opens a small menu with two
items, **New file** and **Open file…**, instead of creating a new tab immediately.

Read `docs/plans/new-menu-and-full-width/README.md` first (decisions and rules), then
`src/components/Tabs/TabStrip.tsx` + `TabStrip.css`, `src/components/Toolbar/ExportMenu.tsx` and
the `.toolbar__menu` / `.toolbar__dropdown` rules in `src/components/Toolbar/Toolbar.css` (copy that
pattern), `src/store/tabs.ts` (`newTab`), `src/store/document.ts` (`openWithDialog`) and the
shortcut map in `src/App.tsx`.

## Files

- `src/components/Tabs/TabStrip.tsx`
- `src/components/Tabs/TabStrip.css`

## Tasks

- [ ] **A1. State and closing.** In `TabStrip`, add `const [menuOpen, setMenuOpen] = useState(false)`
  and a `menuRef` on a wrapper `<div className="tabstrip__menu">` around the `+` button and its
  dropdown. Close the menu on a mousedown outside the wrapper and on Escape, exactly like the
  `useEffect` in `ExportMenu.tsx` (listeners only while open, removed on cleanup).
- [ ] **A2. The button.** Keep `className="tabstrip__new"`, the `Plus` icon, and the ICON props.
  Change it to toggle the menu: `onClick={() => setMenuOpen((v) => !v)}`, with
  `aria-haspopup="menu"`, `aria-expanded={menuOpen}`, `aria-label="New or open"`,
  `title="New or open a file"`. Add the class `is-active` while the menu is open.
- [ ] **A3. The menu.** When open, render below the button:
  ```tsx
  <div className="tabstrip__dropdown" role="menu">
    <button role="menuitem" onClick={…}>
      <FilePlus2 {...MENU_ICON} /> <span>New file</span> <kbd>Ctrl+T</kbd>
    </button>
    <button role="menuitem" onClick={…}>
      <FolderOpen {...MENU_ICON} /> <span>Open file…</span> <kbd>Ctrl+O</kbd>
    </button>
  </div>
  ```
  - `FilePlus2` and `FolderOpen` come from `lucide-react`. Define
    `const MENU_ICON = { ...ICON, size: 14 } as const;` next to the component.
  - **New file:** `setMenuOpen(false); void newTab();` (the existing `newTab` selector).
  - **Open file…:** `setMenuOpen(false); void useDocumentStore.getState().openWithDialog();`
    (`openWithDialog` already opens the picked files as tabs or replaces the document,
    depending on the "Open files in" setting. Don't duplicate that logic).
  - When the menu opens, move keyboard focus to the first item. ArrowDown/ArrowUp move between
    the two items, and Escape closes the menu and puts focus back on the `+` button.
  - **None** of these elements get `data-tauri-drag-region`.
- [ ] **A4. CSS** in `TabStrip.css`, BEM, tokens only (no raw hex; the shadow may use `rgba()` like
  `.toolbar__dropdown` does):
  - `.tabstrip__menu { position: relative; display: flex; }` (so the button keeps its full height).
  - `.tabstrip__new.is-active { background: var(--chrome-hover); }`
  - `.tabstrip__dropdown`: same look as `.toolbar__dropdown` (`position: absolute; top: 100%;
    left: 0; z-index: 40; min-width: 200px; padding: 4px; border-radius: 6px; background:
    var(--chrome-bg); border: 1px solid var(--chrome-border); box-shadow: 0 6px 20px rgba(0, 0, 0,
    0.25);`).
  - Items: `display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0
    10px; border: 0; border-radius: 4px; background: transparent; color: var(--chrome-fg);
    font-size: 12.5px; text-align: left;`. Hover and `:focus-visible` →
    `background: var(--chrome-hover)`. The `<span>` gets `flex: 1`. The `<kbd>` uses `font: inherit;
    font-size: 11px; color: var(--chrome-fg-muted);`.
  - Check that the dropdown isn't clipped. The tab list has `overflow-x: auto`, but the `+` is
    outside the list, so it shouldn't be; if it is, fix it without changing the tab list's scrolling.
- [ ] **A5.** The Ctrl+T and Ctrl+O shortcuts don't change. The Settings shortcuts table doesn't
  change.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit` pass; `pnpm format` run on touched files.
- [ ] Manual check (see "Running the dev app" in `docs/plans/tabs/README.md`), started with the
  absolute path of `fixtures\gfm.md`:
  1. Click the `+` button through the DOM (`document.querySelector('.tabstrip__new').click()`).
     Read back `document.querySelectorAll('.tabstrip__dropdown [role=menuitem]').length` (must
     be 2) and `document.activeElement.textContent`. Take a screenshot of the open menu in
     **dark** theme and one in **light** theme (`__mdv.settings.getState().set('appTheme', …)`),
     then Read both and describe exactly what they show. Put the theme back afterwards.
  2. Click **New file**. Read back the tab count (goes up by 1), the active document's `path`
     (null) and `viewMode` (`'source'`), and confirm the menu is closed (no `.tabstrip__dropdown`).
  3. Open the menu, then dispatch a mousedown on `document.body`. The menu closes.
  4. Open the menu and dispatch an Escape keydown. The menu closes and focus is back on
     `.tabstrip__new`.
  5. You can't drive the native Open dialog through CDP. Check instead that clicking **Open
     file…** closes the menu (read it back), and in the Report say which function it calls.
     Close the native dialog if it appeared (press Escape on it only if you can; otherwise stop
     the app).
  Stop the app afterwards.
- [ ] Commit: `Turn the new-tab button into a New file / Open file menu`.

## Report

_(Fill in: the eval outputs for each step, the screenshot paths, anything that didn't work.)_
