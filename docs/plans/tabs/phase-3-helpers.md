# Phase 3: Pure helpers for tab bookkeeping

**Goal:** a framework-free module, `src/lib/tabs.ts`, with the small pieces of logic the tabs
store and tab strip need, fully unit-tested. **No other files change.** Nothing uses these
helpers yet.

Read `docs/plans/tabs/README.md` (agent rules) first. Look at `src/lib/scrollSync.ts` +
`scrollSync.test.ts` and `src/lib/links.ts` + `links.test.ts` for the house style (JSDoc on
every export, `describe`/`it`, no mocking).

## Files

- `src/lib/tabs.ts` (new)
- `src/lib/tabs.test.ts` (new)

## Tasks

Write each function with a one-line `/** … */` JSDoc. Only import `basename` / `dirname` from
`@/lib/tauri` (they're pure) if you need them. Nothing else from the app.

- [x] **1. `samePath(a: string, b: string): boolean`.** True when the two paths refer to the same
  file on Windows: compare after lower-casing and turning every `\` into `/`. Also ignore one
  trailing separator. Don't touch the file system.
- [x] **2. `findTabByPath<T extends { id: string; path: string | null }>(tabs: readonly T[], path: string): string | null`.**
  Returns the `id` of the first tab whose `path` is non-null and `samePath` with `path`, else `null`.
- [x] **3. `isBlankDocument(doc: { hasDocument: boolean; path: string | null; content: string; savedContent: string }): boolean`.**
  True when `!doc.hasDocument`, **or** when `doc.path === null && doc.content === '' && doc.savedContent === ''`.
  (A blank tab can take a file instead of opening a new tab.)
- [x] **4. `nextActiveAfterClose(ids: readonly string[], closingId: string, activeId: string | null): string | null`.**
  - If `closingId` isn't `activeId`, return `activeId` (unchanged).
  - Otherwise return the id to the **right** of `closingId`, else the one to the **left**, else
    `null` (it was the only tab).
  - If `closingId` isn't in `ids`, return `activeId`.
- [x] **5. `moveItem<T>(items: readonly T[], from: number, to: number): T[]`.** Returns a **new**
  array with the item at `from` moved to index `to`. Clamp `to` to `[0, length - 1]`. Return a
  copy unchanged if `from` is out of range or `from === to`.
- [x] **6. `tabLabels(paths: readonly (string | null)[]): string[]`.** Returns one label per
  entry, in the same order:
  - `null` (untitled) → `Untitled`. The second untitled → `Untitled 2`, the third → `Untitled 3`,
    and so on, counting in order of appearance.
  - A path → its basename, e.g. `README.md`.
  - When two or more paths share a basename (compare without case), add ` · ` and **the shortest
    parent-folder suffix that tells them apart**. Take parent folders from the right, one at a
    time, until the suffixes are all different. Examples:
    - `C:\a\docs\README.md`, `C:\a\api\README.md` → `README.md · docs`, `README.md · api`
    - `C:\x\one\docs\README.md`, `C:\y\two\docs\README.md` → `README.md · one/docs`,
      `README.md · two/docs` (join multi-folder suffixes with `/`)
    - If two paths are identical (shouldn't happen), give them the same label; don't loop forever.
  - Accept both `/` and `\` as separators.
- [x] **7. Tests (`src/lib/tabs.test.ts`).** One `describe` per function. Cover at least:
  - `samePath`: same case; different case; `/` vs `\`; a trailing slash; different files → false.
  - `findTabByPath`: found; not found; skips tabs with `path: null`; case and slash differences.
  - `isBlankDocument`: no document; untitled and empty; untitled with typed text → false; a file
    → false.
  - `nextActiveAfterClose`: closing an inactive tab; closing the active middle tab (→ right); the
    active last tab (→ left); the only tab (→ null); unknown id.
  - `moveItem`: forwards, backwards, clamping, out-of-range `from`, and that the input isn't
    mutated.
  - `tabLabels`: unique names; two untitled; the two duplicate examples above; mixed separators;
    three duplicates where two share a parent folder name.
  Write Windows paths in the test file with the Write/Edit tool (`'C:\\a\\docs\\README.md'`).

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit` pass.
- [x] `git status` shows only the two new files and this phase document.
- [x] Commit: `Add pure helpers for tab bookkeeping`.

## Report

All seven functions implemented and tested:

1. **`samePath`**: Compares Windows paths case-insensitively, treating `/` and `\` as equivalent, and ignoring trailing separators.
2. **`findTabByPath`**: Returns the first tab id whose path matches the given path using `samePath`.
3. **`isBlankDocument`**: Returns true for documents with no file handle, or empty untitled documents with no saved content.
4. **`nextActiveAfterClose`**: Selects the next active tab after closing one—right neighbor if available, else left, else null.
5. **`moveItem`**: Generic array-move function that clamps the destination and returns a new array.
6. **`tabLabels`**: Generates smart tab labels with parent-folder suffixes for duplicate basenames. Normalizes trailing separators in paths before processing.

All 131 unit tests pass. Code follows house style: JSDoc on every export, no mocking except at boundaries (`@/lib/tauri`), Prettier formatting, no `any` types. Both Windows paths (backslash) and Unix paths (forward slash) handled correctly in tests via the Write/Edit tools.
