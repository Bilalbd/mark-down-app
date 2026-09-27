# Phase 3: Cut per-keystroke work

**Items:** B1, B2, B3. **README:** no change. No visible change.

Read `docs/plans/review-followups/README.md` first, then `src/App.tsx`,
`src/components/Editor/SourceEditor.tsx`, `src/components/Preview/Preview.tsx`,
`src/markdown/render.ts`, `src/store/view.ts`, `src/components/Outline/Outline.tsx`.

## What happens today on every keystroke

1. **B1:** `App` selects `content` (`App.tsx` line ~55) only to feed the outline's heading parse.
   So the whole `App` re-renders on each keystroke, and with it `TitleBar`, `TabStrip`, `Toolbar`
   and the other panels (none are memoised).
2. **B2:** CodeMirror's update listener calls `setContent(doc.toString())` (one full copy). Then the
   "fallback sync" effect in `SourceEditor` calls `view.state.doc.toString()` **again** and
   compares it with `content` (a second full copy and a full comparison).
3. **B3:** in Formatted and Split view the document is parsed twice after each edit: by
   `extractHeadings` in `App` and by `renderMarkdown` in `Preview`, which already returns the same
   `headings` and throws them away.

## Files

- `src/App.tsx`
- New: `src/components/Outline/HeadingsSync.tsx` (no CSS)
- `src/components/Editor/SourceEditor.tsx`
- `src/components/Preview/Preview.tsx`
- New test: `src/components/Editor/SourceEditor.test.tsx` (or a pure-helper test, see task 3)

## Tasks

- [ ] **1. B1 + B3: `HeadingsSync`.** A component that renders `null` and owns the outline's heading
  updates:
  ```tsx
  /** Keeps the outline's headings current. In Source view it parses headings itself (cheap
   * headings-only parse); in Formatted and Split the Preview supplies them from its render. */
  export function HeadingsSync() { … }
  ```
  It selects `content` and `viewMode`. Only when `viewMode === 'source'` does it run the existing
  debounced (150 ms) `setHeadings(extractHeadings(content))`. Move that effect out of `App.tsx`,
  remove `App`'s `content` selector and the `extractHeadings` / `setHeadings` imports it no longer
  needs, and render `<HeadingsSync />` next to `<StyleInjector />`.
- [ ] **2. Preview supplies headings.** In `Preview.tsx`, after a render that isn't superseded,
  call `useViewStore.getState().setHeadings(result.headings)` right where `setHtml` is called.
  Check: switching Source → Formatted must still show the right outline straight away (the preview
  renders a new load with 0 ms delay, and the heading list from Source view stays until then, so
  there's no empty flash). Switching Formatted → Source: `HeadingsSync` runs its effect when
  `viewMode` changes, so the outline stays right.
- [ ] **3. B2: skip the second copy.** In `SourceEditor.tsx`, keep a module-level
  `let lastEmitted: string | null = null;` that the update listener sets to the string it passes to
  `setContent`. In the fallback-sync effect, return early when `content === lastEmitted` (the same
  string object, so the comparison is instant) before calling `toString()`. Reset `lastEmitted` to
  `null` when a new editor state is created or restored (on mount and in the `loadId` effect), so a
  reload is never skipped.
  **Test:** extract the decision into an exported pure function in `SourceEditor.tsx`, for example
  `needsExternalSync(content, lastEmitted, readDoc: () => string): boolean`, which returns false
  without calling `readDoc` when `content === lastEmitted`, and otherwise compares. Test that
  `readDoc` isn't called in the fast case and that a real external change is detected.
- [ ] **4. Check render counts.** Before your change, measure how often `App` renders per keystroke:
  temporarily add a render counter (e.g. `window.__appRenders = (window.__appRenders ?? 0) + 1` in
  `App`'s body), type 10 characters through the editor in the running app (see Verify), read the
  counter, then **remove the counter** before committing. Do the same after the change. Paste both
  numbers. The target: `App` renders 0 times per keystroke once the dirty flag is set (the first
  keystroke flips `dirty`, which is expected to render once).

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`. `git diff` must not contain the
  temporary counter.
- [ ] Manual check on a scratch copy of `fixtures/huge.md` and of `fixtures/gfm.md`:
  - Type into the editor from CDP: `__mdv.view.getState().editorView.dispatch({ changes: { from: 0,
    insert: 'a' } })` repeated 10 times (the editor view is on the view store). Don't save.
  - Outline correct in all three views: switch view mode, then compare
    `__mdv.view.getState().headings.length` and the first/last heading text with what
    `__mdv.render` gives for the same content (`(await __mdv.render(content)).headings`).
  - Edit a heading's text in Split view and check the outline updates within ~300 ms.
  - Screenshot Split view with the outline in dark mode.
  - Discard the edits (reload the file or close without saving via the dialog's Don't save).
- [ ] Commit: `Cut per-keystroke work: no App re-render, no double copy or parse`.

## Report

(fill in: tests before → after, App renders per 10 keystrokes before and after, outline checks)
