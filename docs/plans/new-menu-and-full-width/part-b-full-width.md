# Part B: Full-width toggle for the Formatted view

**Goal:** a toolbar button, shown only in Formatted view, switches the formatted document between
the preset's content width (default) and the full window width. The choice is saved.

Read `docs/plans/new-menu-and-full-width/README.md` first (decisions and rules), then
`src/store/settings.ts` (+ `settings.test.ts`), `src/components/Toolbar/Toolbar.tsx` (look at the
swap-panes button that only shows in Split view, and copy that pattern), `Toolbar.css`,
`src/components/Preview/Preview.tsx`, the `.preview` rule in `src/components/Preview/Preview.css`,
and `src/components/Split/SplitView.tsx` (it also renders `<Preview />`, which must **not** go
full width).

## Files

- `src/store/settings.ts`, `src/store/settings.test.ts`
- `src/components/Toolbar/Toolbar.tsx`
- `src/components/Preview/Preview.tsx`, `src/components/Preview/Preview.css`

## Tasks

- [ ] **B1. Setting.** In `settings.ts` add to `Settings`, with the JSDoc
  `/** Formatted view fills the window width instead of the preset's content width. */`,
  `previewFullWidth: boolean;`, and `previewFullWidth: false` to `DEFAULTS`. It **is** saved (not in
  `EPHEMERAL_KEYS`).
- [ ] **B2. Pure helper + test.** In `settings.ts`, export:
  ```ts
  /** Whether the preview should ignore the preset's content width (Formatted view only, not Split). */
  export function isPreviewFullWidth(s: Pick<Settings, 'previewFullWidth' | 'viewMode'>): boolean {
    return s.previewFullWidth && s.viewMode === 'formatted';
  }
  ```
  Add tests in `settings.test.ts` (add a new `describe`; don't touch existing tests): the default is
  `false`; the helper is true only for `formatted` + on, and false for `split` and `source` even when
  on.
- [ ] **B3. Preview.** In `Preview.tsx`, read `const fullWidth = useSettingsStore((s) =>
  isPreviewFullWidth(s));` (one selector returning a boolean). Add the modifier class to the
  article: `className={\`preview${fullWidth ? ' preview--full' : ''}\`}`. Nothing else in the
  component changes.
- [ ] **B4. CSS.** In `Preview.css`, right after the `.preview` rule, add:
  ```css
  /* Full-width Formatted view (toolbar toggle): fill the window instead of the preset's width. */
  .preview--full {
    max-width: none;
  }
  ```
  Keep the existing side padding. Check that `@media print` in `src/styles/base.css` isn't affected.
  Printing uses its own layout, but look at it and say in the Report whether it references
  `max-width` for `.preview`.
- [ ] **B5. Toolbar button.** In `Toolbar.tsx`, right after the Split-only swap-panes button, add a
  Formatted-only toggle:
  ```tsx
  {viewMode === 'formatted' && (
    <button
      className={`toolbar__btn ${previewFullWidth ? 'is-active' : ''}`}
      title={previewFullWidth ? 'Use the preset’s content width' : 'Full width (fit the window)'}
      aria-label="Full width"
      aria-pressed={previewFullWidth}
      onClick={() => set('previewFullWidth', !previewFullWidth)}
    >
      <UnfoldHorizontal {...ICON} />
    </button>
  )}
  ```
  `UnfoldHorizontal` comes from `lucide-react` (it's installed). Read `previewFullWidth` with its own
  selector. Use a real ’ in the title (British typographic apostrophe) or rephrase to avoid one.
- [ ] **B6. README.** In `README.md`, in the features list near the view modes / outline items, add
  one short line: Formatted view has a full-width toggle in the toolbar that fits the document to
  the window, and it's remembered. Keep the surrounding style.

## Verify

- [ ] `pnpm test` (count goes up), `pnpm lint`, `npx tsc --noEmit` pass; `pnpm format` run.
- [ ] Manual check (see "Running the dev app" in `docs/plans/tabs/README.md`), started with the
  absolute path of `fixtures\gfm.md`, window as it opens:
  1. Formatted view, toggle off: read back
     `document.querySelector('.preview').getBoundingClientRect().width` and
     `document.querySelector('.preview-scroll').clientWidth`. The preview is at most the preset
     content width.
  2. Click the button (find it with `document.querySelector('[aria-label="Full width"]')`). Read back the
     same two widths (the preview is now the scroll container's width, minus nothing but its own
     padding), `aria-pressed` ("true"), and `__mdv.settings.getState().previewFullWidth` (true).
     Screenshot, Read it, and describe it.
  3. Switch to Split view (`set('viewMode','split')`): the button is gone (query returns null) and
     the preview has **no** `preview--full` class. Switch to Source: the button is gone.
  4. Back to Formatted: still full width (class present). Toggle off: the class is gone.
  5. Leave it **on**, stop the app, start it again, and read back `previewFullWidth` (true, so it
     was saved) and that the class is present. Then toggle it **off** again so the user's setting
     is back to the default, and stop the app.
- [ ] Commit: `Add a full-width toggle for the Formatted view`.

## Report

_(Fill in: the eval outputs for each step, the screenshot path, the print-CSS note, anything that
didn't work.)_
