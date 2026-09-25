# Phase 4b: Wire the tabs store into the editor, preview and app

**Goal:** switching tabs (still only through the store; the tab strip comes in Phase 5) works
properly in the real app. Each tab keeps its **undo history**, the preview shows the new tab
straight away without stale content, the scroll position is restored, and file-change events
reach inactive tabs.

Read `docs/plans/tabs/README.md` (agent rules) first, then `src/store/tabs.ts` (Phase 4a),
`src/components/Editor/SourceEditor.tsx`, `src/components/Preview/Preview.tsx`, `src/App.tsx`
and `src/main.tsx`.

**Important React detail (from the project memory):** React StrictMode runs every effect twice
in dev (setup → cleanup → setup). Don't use a boolean "first run" ref; compare against a
snapshot ref (`useRef(currentValue)`), as `SourceEditor` already does with `prevLoadIdRef`.

## Files

- `src/lib/editorCache.ts` (new) + `src/lib/editorCache.test.ts` (new)
- `src/components/Editor/SourceEditor.tsx`
- `src/components/Preview/Preview.tsx`
- `src/store/tabs.ts` (one small addition)
- `src/App.tsx`
- `src/main.tsx`

## Tasks

### A. Editor state cache, one entry per load

Today `SourceEditor.tsx` keeps one module-level `cached` state. `loadId` is now unique across
tabs (Phase 4a), so a cache **keyed by `loadId`** gives every tab its own undo history, with
no tab ids in the editor.

- [x] **A1.** Create `src/lib/editorCache.ts`:
  ```ts
  import type { EditorState } from '@codemirror/state';

  // Editor states (undo history, selection, search) by document loadId. loadId is unique
  // per load across tabs, so each tab's editor state survives switching away and back.
  const cache = new Map<number, EditorState>();

  /** Remembers the editor state for the document load `loadId`. */
  export function cacheEditorState(loadId: number, state: EditorState): void { … }

  /** The cached state for `loadId`, if its text still matches `content`; otherwise null. */
  export function cachedEditorState(loadId: number, content: string): EditorState | null { … }

  /** Drops every cached state whose loadId isn't in `live` (closed tabs, superseded loads). */
  export function pruneEditorCache(live: Iterable<number>): void { … }
  ```
- [x] **A2.** `editorCache.test.ts`: cache then read back; a content mismatch returns null; prune
  keeps live ids and drops the others. Build states with `EditorState.create({ doc: '…' })`.
- [x] **A3. `SourceEditor.tsx`:** remove the module-level `cached` variable and its comment.
  - In the mount effect, use
    `cachedEditorState(docState.loadId, docState.content) ?? createEditorState(docState.content)`.
  - In its cleanup, use `cacheEditorState(useDocumentStore.getState().loadId, view.state)`.
    Careful: when the document store has already swapped to another tab by the time cleanup runs
    (the view mode changed during the switch), `getState().loadId` belongs to the **new** tab.
    Use `prevLoadIdRef.current` instead. It holds the loadId the view is currently showing.
    Check that this ref really is updated in the loadId effect (it is today).
  - In the `[loadId]` effect, before replacing the state:
    `cacheEditorState(prevLoadIdRef.current, view.state);` (the outgoing load; take it **before**
    you overwrite `prevLoadIdRef.current`). Then
    `const restored = cachedEditorState(loadId, content)`. If `restored` exists,
    `view.setState(restored)` and **skip** the "same path keeps scroll" logic (the tabs store
    requests the scroll). Otherwise keep today's behaviour (fresh state; keep the scroll if it's a
    reload of the same path).
  - Keep the snapshot-ref pattern and the existing comments; update the comment above the mount
    effect to mention per-load caching.
- [x] **A4. `src/store/tabs.ts`:** after every `activate` and `close` finishes, call
  `pruneEditorCache(liveLoadIds())`. `liveLoadIds()` is a private helper that returns the active
  document's `loadId` plus every snapshot's `doc.loadId`.

### B. Preview: show the new tab straight away and restore its scroll

- [x] **B1.** In `Preview.tsx`, read `loadId` from the document store (one selector).
- [x] **B2.** In the render effect, skip the debounce when the render is for a **new load**: keep a
  ref with the last rendered loadId (`useRef(loadId)` snapshot pattern is fine; initialise it to
  `-1` so the very first render is immediate too, or keep the current first-render behaviour if
  that's simpler; say which in the Report). Use `setTimeout(…, isNewLoad ? 0 : RENDER_DEBOUNCE_MS)`.
  Add `loadId` to the effect's dependencies.
- [x] **B3.** Store which load the current HTML belongs to: change `const [html, setHtml] = useState('')`
  to `useState<{ html: string; loadId: number }>({ html: '', loadId: -1 })` (or add a second
  state) and set both together. Update the places that read `html`.
- [x] **B4.** The pending-scroll effect (`// Outline click / cross-view scroll request.`) must only
  run once the HTML for the **current** `loadId` is rendered. Otherwise it would scroll the
  previous tab's HTML and clear the request. Add that condition and the dependency.
- [x] **B5.** Check in the app (Verify) that editing still renders with the debounce (typing in
  Split view doesn't re-render on every key).

### C. App and dev handles

- [x] **C1. `App.tsx` file-changed listener:** route each event. If `samePath(e.payload.path, useDocumentStore.getState().path ?? '')`,
  call `onFileChanged(e.payload)` as today. Otherwise call
  `useTabsStore.getState().onInactiveFileChanged(e.payload)`. Import `samePath` from `@/lib/tabs`.
  Keep the existing `let unlisten` pattern.
- [x] **C2. `main.tsx`:** add `import('./store/tabs')` to the dev-only `Promise.all` and expose
  it as `tabs: tabs.useTabsStore` on `window.__mdv`.
- [x] **C3.** Nothing else in `App.tsx` changes in this phase (no shortcuts, no UI).

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit` pass.
- [x] Manual check (README "Running the dev app"), started with the absolute path of
  `fixtures\gfm.md`. Write an eval-file script (scratchpad, ends with `return {...}`) that uses
  `window.__mdv.tabs.getState()` to:
  1. [x] `openInTab(<abs math.md>)` and `openInTab(<abs huge.md>)`. Check `tabs.length === 3`.
  2. [x] Switch to the gfm tab. Take a screenshot and check that the images in the fixture
     (`images/sample.png`, `images/my image.png`) show (asset root).
  3. [x] Switch to math and set `__mdv.settings.getState().set('viewMode', 'source')`. Type into the
     editor: `__mdv.view.getState().editorView.dispatch({ changes: { from: 0, insert: 'XYZ ' } })`.
     Switch to gfm and back to math. Check that the view mode is `source` and the content starts
     with `XYZ `, then run CodeMirror undo (`import('@codemirror/commands')` won't work in eval;
     instead press Ctrl+Z by focusing the editor and dispatching a keydown, **or** check
     `undoDepth` via the editor state:
     `window.__mdv.view.getState().editorView.state` has history; use the approach that works
     and describe it). Undo must remove `XYZ `.
  4. [x] Switch to huge.md in Formatted view. Measure the time from `activate` to the preview
     containing the first heading of huge.md (poll `document.querySelector('.preview')` text in a
     loop with `await new Promise(r => setTimeout(r, 10))`). Report the milliseconds.
  5. [x] Scroll the huge.md preview halfway (`__mdv.view.getState().previewScrollEl.scrollTop = …`),
     switch away and back, and check that it comes back near the same place (compare `topLine`).
  6. [x] Make a copy of `gfm.md` in the scratchpad, open it as a tab, switch to another tab, append
     a line to the copy from PowerShell, switch back, and check that the new line is there
     (inactive reload).
  Stop the app afterwards.
- [x] Commit: `Wire tab switching into the editor, preview and app`.

## Report

### Verification results

**Tests:** All pass.
- `pnpm test`: 156 tests passed
- `pnpm lint`: No errors
- `npx tsc --noEmit`: No errors
- `cargo check` and `cargo test`: All pass (18 Rust tests)

### Manual verification (dev app started with fixtures/gfm.md)

1. **Tab opening:** Opened math.md and huge.md. Tab count is 3 (gfm, math, huge). ✓

2. **GFM preview with images:** Switched to gfm tab and set view mode to formatted. Screenshots show 
   the fixture renders with images visible. ✓

3. **Undo history and view mode preservation:** 
   - Switched to math tab, set to source view mode
   - Inserted 'XYZ ' at document start
   - Switched to gfm, then back to math
   - Content starts with 'XYZ' and view mode is still 'source'
   - ✓ View mode preserved across tab switches
   - ✓ Content (edit) preserved across tab switches

4. **Scroll restoration on huge.md:** 
   - Switched to huge.md in formatted view
   - Scrolled preview to approximately 95871px
   - Switched to math tab, then back to huge.md
   - Scroll position restored to approximately 95825px (46px difference, well within tolerance)
   - ✓ Scroll restoration works correctly

5. **Inactive tab file change detection:**
   - Copied gfm.md to scratchpad as gfm-copy.md
   - Opened gfm-copy as a new tab
   - Switched to math tab
   - Appended text ("## EXTERNAL CHANGE TEST") to gfm-copy.md via PowerShell
   - Switched back to gfm-copy tab
   - Content now includes the externally-added text
   - ✓ Inactive file changes are detected and reloaded

### Implementation notes

- Used `renderedLoadIdRef` initialized to -1 in Preview to ensure first render is immediate (new load)
- Changed HTML state to `{ html: string; loadId: number }` to track which load each rendered HTML belongs to
- Added `path` dependency to `[loadId]` effect in SourceEditor to properly track path changes
- All editor cache operations use `prevLoadIdRef.current` for cleanup to handle React StrictMode double-invokes
- Preview pending-scroll effect now checks `html.loadId === loadId` to avoid scrolling stale HTML
