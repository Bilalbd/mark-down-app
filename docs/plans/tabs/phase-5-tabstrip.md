# Phase 5: Tab strip in the title bar, and tab shortcuts

**Goal:** open documents show as tabs in the custom title bar, like Windows 11 Notepad. Users
can switch, close and add tabs with the mouse and keyboard. Opening files **isn't rerouted
yet** (Ctrl+O still replaces the active document). That comes in Phase 6. To test, open tabs
through `__mdv.tabs` or the `+` button.

Read `docs/plans/tabs/README.md` (agent rules) first, then `src/components/TitleBar/TitleBar.tsx`
+ `.css`, `src/components/Toolbar/Toolbar.tsx` (for `ICON`), `src/store/tabs.ts`, `src/lib/tabs.ts`,
`src/lib/shortcuts.ts`, `src/App.tsx`, `src/components/Settings/GeneralTab.tsx`,
`src/styles/app-theme.css`.

## Files

- `src/store/settings.ts` (the new setting key only)
- `src/components/Tabs/TabStrip.tsx` (new), `src/components/Tabs/TabStrip.css` (new)
- `src/components/TitleBar/TitleBar.tsx`, `TitleBar.css`
- `src/App.tsx` (shortcuts)
- `src/components/Settings/GeneralTab.tsx` (shortcuts table only)

## Tasks

### A. The setting key (UI for it comes in Phase 6)

- [ ] **A1.** In `settings.ts`: `export type OpenFilesIn = 'tab' | 'window';`. Add to `Settings`,
  with the JSDoc `/** Whether files opened from Explorer or inside the app become tabs or separate windows. */`,
  `openFilesIn: OpenFilesIn;`. Add `openFilesIn: 'tab'` to `DEFAULTS`. It **is** saved (not in
  `EPHEMERAL_KEYS`).

### B. `TabStrip` component

- [ ] **B1. Data.** Use one selector per value: `tabs` and `activeId` from `useTabsStore`;
  `path`, `hasDocument` and dirty (`isDirty`) from `useDocumentStore`. With `useMemo`, build
  `items: { id, label, title, dirty, active }[]`:
  - A tab's document is the live document store for the active tab, and `snapshot.doc` otherwise.
  - Labels: `tabLabels(paths)` from `@/lib/tabs`, but a tab with `!hasDocument` (start
    screen) is labelled `New tab`.
  - `title` (tooltip) is the full path, or the label for untitled tabs.
- [ ] **B2. Markup.**
  ```tsx
  <div className="tabstrip">
    <div className="tabstrip__list" role="tablist" aria-label="Open documents" ref={listRef} onWheel={…}>
      {items.map((t) => (
        <div key={t.id} role="tab" aria-selected={t.active} tabIndex={t.active ? 0 : -1}
             className={`tabstrip__tab${t.active ? ' is-active' : ''}${t.dirty ? ' is-dirty' : ''}`}
             title={t.title} onClick={…activate} onAuxClick={…middle-click closes (e.button === 1)}
             onMouseDown={…prevent default for button 1 (stops autoscroll)} onKeyDown={…}>
          <span className="tabstrip__label">{t.label}</span>
          {t.dirty && <span className="tabstrip__dirty" aria-label="Unsaved changes">•</span>}
          <button className="tabstrip__close" aria-label={`Close ${t.label}`} tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); void close(t.id); }}>
            <X size={14} strokeWidth={1.75} absoluteStrokeWidth />
          </button>
        </div>
      ))}
    </div>
    <button className="tabstrip__new" aria-label="New tab" title="New tab (Ctrl+T)" onClick={() => void newTab()}>
      <Plus {...ICON} />
    </button>
  </div>
  ```
  Import `ICON` from `@/components/Toolbar/Toolbar`. Async handlers use `() => void fn()`.
  **None** of these elements get `data-tauri-drag-region`.
- [ ] **B3. Keyboard.** On a focused tab: ArrowLeft / ArrowRight move focus to the previous / next
  tab (focus the DOM element; wrap around), Home / End go to the first / last, Enter / Space
  activate, Delete closes. `tabIndex` roving: only the active tab is 0.
- [ ] **B4. Overflow.** The list scrolls horizontally with no visible scrollbar. The mouse wheel
  (vertical delta) scrolls it sideways (`listRef.current.scrollLeft += e.deltaY`). When
  `activeId` changes, scroll the active tab into view
  (`el.scrollIntoView({ block: 'nearest', inline: 'nearest' })`).
- [ ] **B5. CSS (`TabStrip.css`)**, BEM, tokens only (no hex). Match the title bar height
  (`var(--titlebar-height)`):
  - `.tabstrip`: `display: flex; align-items: stretch; min-width: 0; height: 100%;`
  - `.tabstrip__list`: `display: flex; overflow-x: auto; scrollbar-width: none; min-width: 0;`
  - `.tabstrip__tab`: `flex: 0 1 200px; min-width: 100px; display: flex; align-items: center; gap: 4px; padding: 0 6px 0 12px; font-size: 12px; color: var(--chrome-fg-muted); border-right: 1px solid var(--chrome-border); cursor: default;`
    `:hover` → `background: var(--chrome-hover)`. `.is-active` → `background: var(--chrome-inset); color: var(--chrome-fg); box-shadow: inset 0 -2px 0 var(--accent);`
    `:focus-visible` → a visible outline using `var(--accent)`.
  - `.tabstrip__label`: `flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
  - `.tabstrip__dirty`: same look as `.titlebar__dirty` (accent colour).
  - `.tabstrip__close`: 20×20, transparent, rounded, `color: inherit`; hidden (`visibility: hidden`)
    unless the tab is hovered, active or focused. When the tab is dirty and not hovered, show
    the dot and hide the close button, as Notepad does. Hover → `var(--chrome-hover)`.
  - `.tabstrip__new`: 32px wide, transparent, `color: var(--chrome-fg)`, hover `var(--chrome-hover)`.
  - Don't add new colour tokens. If you really need one, add it to `app-theme.css` with light and
    dark values **and** map it in `src/styles/chromeCss.ts`, and explain why in the Report.

### C. Title bar

- [ ] **C1.** `TitleBar` decides whether to show the strip:
  `showTabs = openFilesIn === 'tab' || tabs.length > 1` (settings and tabs stores, one selector each).
- [ ] **C2.** When `showTabs`: render the logo (keep it and its drag attribute), then
  `<TabStrip />` in place of the `Markdown – • file` text, then a drag spacer
  `<div className="titlebar__drag" data-tauri-drag-region />` with `flex: 1` that fills the rest,
  then the window controls. When not showing tabs, render exactly what renders today.
  `.titlebar__title` currently has `flex: 1`. Make sure the strip version doesn't stretch the
  tabs; give the strip's wrapper `flex: 0 1 auto; min-width: 0` so tabs shrink before the
  spacer disappears. Keep a minimum spacer width of about 40px, so there is always room to
  drag the window.
- [ ] **C3.** `document.title` logic doesn't change (it follows the active document).

### D. Shortcuts

- [ ] **D1.** In `App.tsx`, add to the `shortcuts` map (read state with `getState()` inside the
  handlers, so the `useMemo` deps don't need to grow much):
  | Combo string | Action |
  |---|---|
  | `ctrl+t` | `newTab()`, only when `openFilesIn === 'tab'` |
  | `ctrl+w` | close the active tab, only when the strip is visible (same rule as C1) |
  | `ctrl+tab`, `ctrl+pagedown` | activate the next tab (wrap around) |
  | `ctrl+shift+tab`, `ctrl+pageup` | activate the previous tab (wrap around) |
  | `ctrl+1` … `ctrl+8` | activate tab N if it exists |
  | `ctrl+9` | activate the last tab |
  `comboOf` lower-cases `e.key`, so the keys are `tab`, `pagedown`, `pageup`, `1`…`9`. With
  Shift, `e.key` is still `Tab`. Check this. Put the "next/previous index" arithmetic in a
  small exported pure helper in `src/lib/tabs.ts` (`cycleIndex(length, index, delta)`) with tests.
- [ ] **D2.** Test in the running app that Ctrl+Tab reaches the handler while CodeMirror has focus
  (the hook listens in the capture phase, so it should). If WebView2 swallows Ctrl+Tab, say so in
  the Report; Ctrl+PageDown is the fallback.
- [ ] **D3.** `GeneralTab.tsx` shortcuts table: add rows `['Ctrl+T', 'New tab']`,
  `['Ctrl+W', 'Close tab']`, `['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab']`,
  `['Ctrl+1 … Ctrl+9', 'Go to tab']`. Place them after `Ctrl+O`.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit` pass.
- [ ] Manual check (README "Running the dev app"), starting with `fixtures\gfm.md`. Use
  `__mdv.tabs.getState().openInTab(...)` to open `math.md`, `mermaid.md` and `unicode.md`. Take
  screenshots (save them in the scratchpad and **list their paths in the Report**):
  1. 4 tabs, dark theme (`__mdv.settings.getState().set('appTheme','dark')`).
  2. The same in light theme.
  3. A dirty tab (type into the source editor) showing the dot.
  4. About 15 tabs: open the same fixtures from copies in the scratchpad (distinct paths).
     Check overflow scrolling and that the active tab is visible.
  5. Two `README.md` files in different scratchpad folders, open at once: labels show the folder suffix.
  6. Only one tab: the strip still shows (setting is `'tab'`). With
     `set('openFilesIn','window')` and one tab, the old title returns.
  7. Keyboard: Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+2, Ctrl+W on a dirty tab (the save dialog appears;
     cancel), Ctrl+T. Drive these with `dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))`
     on `document.activeElement`.
  8. The empty space right of `+` has `data-tauri-drag-region`, and the tabs don't (check with a
     DOM query; real dragging can't be tested through CDP, so say so in the Report).
  Stop the app afterwards.
- [ ] Commit: `Show open documents as tabs in the title bar`.

## Report

_(Fill in: screenshot paths, keyboard results, and whether drag-to-reorder was left out, which is
expected in this phase.)_
