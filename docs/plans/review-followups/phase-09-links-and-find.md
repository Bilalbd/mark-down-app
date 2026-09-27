# Phase 9: Follow heading anchors in links, and find across formatting

**Items:** D4, D6. **README:** yes. Links bullet: "a relative link to another Markdown file opens
it in the app **and scrolls to `#heading` if the link has one**".

Read `docs/plans/review-followups/README.md` first, then `src/lib/links.ts` and its test,
`src/components/Preview/Preview.tsx` (`onClick`), `src/markdown/render.ts` (`extractHeadings`),
`src/store/view.ts` (`requestScrollToLine`), `src/lib/previewFind.ts` and its test,
`src/components/Find/FindBar.tsx`, and `fixtures/links.md`.

## D4: `other.md#section` loses the `#section`

`classifyLink` strips `?…` and `#…` before resolving the path, so the heading is lost: the file
opens at the top.

### Tasks

- [x] **1.** `classifyLink` returns `{ kind: 'markdown'; path: string; anchor?: string }`: the
  decoded fragment (like the `anchor` case does, `decodeURIComponent` with the same try/catch),
  omitted when empty. Tests: `other.md#setup`, `other.md#caf%C3%A9`, `other.md#`, `other.md?x=1#a`,
  and that a non-markdown file still ignores the fragment.
- [x] **2.** Pure helper in `src/lib/links.ts` (or next to `extractHeadings` in `render.ts`, your
  choice; say which): Added to `src/markdown/render.ts` next to `extractHeadings`.
  ```ts
  /** 0-based source line of the heading with `id` in `source`, or null. Uses the cheap
   * headings-only parse. */
  export function headingLine(source: string, id: string): number | null
  ```
  Test with duplicate headings (`foo`, `foo-1`) and a missing id.
- [x] **3.** In `Preview.tsx`'s `markdown` case: `void openPath(path).then((ok) => …)`. When `ok`
  and there's an anchor and the now-active document's path is the same file (`samePath`), look up
  `headingLine(useDocumentStore.getState().content, anchor)` and, if found,
  `useViewStore.getState().requestScrollToLine(line)`. The preview and editor already honour
  `pendingScrollLine` once the new load has rendered. Handle a rejected promise with
  `.catch(() => undefined)` and a comment. (In New window mode, Phase 10 will open other files in
  another window; the anchor is then lost. That's accepted; add a one-line comment.)
- [x] **4.** Add to `fixtures/links.md` a link to another fixture with a heading anchor (e.g.
  `[Tables in gfm](gfm.md#table)`; the heading id exists in `gfm.md`).

## D6: find in the preview misses matches that span formatting

`findInPreview` searches each text node on its own, so "foo bar" isn't found in `foo **bar**`
(two text nodes), nor "hello world" across a link.

### Tasks (continued)

- [x] **5.** Pure core, testable without ranges:
  ```ts
  export interface TextSegment { text: string; block: number }
  /** Joins text segments into one searchable string. A "\n" is inserted between segments from
   * different blocks, so a match never runs from one paragraph into the next. `starts[i]` is where
   * segment i begins in `text`. */
  export function joinSegments(segments: readonly TextSegment[]): { text: string; starts: number[] }
  /** Maps an offset in the joined text back to (segment index, offset in that segment). An offset
   * that falls on an inserted "\n" maps to the end of the previous segment. */
  export function locateOffset(starts: readonly number[], segments: readonly TextSegment[], offset: number): { index: number; offset: number }
  ```
  Tests: two segments in one block match across the join; two blocks never match across (a query
  containing the boundary finds nothing); start and end offsets map correctly, including a match
  that ends exactly at a segment end.
- [x] **6.** Rewrite `findInPreview` on top of these: walk text nodes as today (same filters),
  giving each the index of its nearest block ancestor. The block is the closest ancestor matching
  `p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, dt, dd, figcaption, summary` or the
  root; number blocks by first appearance. Run the regex over the joined text, and for each match
  build one `Range` with `setStart`/`setEnd` on the mapped nodes. Keep the exported signature,
  `PreviewMatch`, highlights and the zero-length guard. `setCurrentPreviewMatch` still scrolls to
  `range.startContainer.parentElement`.
- [x] **7.** Tests in `previewFind.test.ts` using jsdom DOM (build a small `<article>`):
  `foo <strong>bar</strong>` finds "foo bar" with one range spanning two text nodes;
  `<p>foo</p><p>bar</p>` does **not** find "foobar"; case-insensitive still works; the
  existing tests pass unchanged. jsdom lacks `CSS.highlights`; the function must still return the
  matches.
- [ ] **8.** Performance: run `findInPreview` on the rendered `fixtures/huge.md` in the dev app
  (see Verify) and report the time for a common word before and after (use `performance.now()`
  around the call). It must stay under ~100 ms; if it's much slower than before, say why. (Done by the supervisor.)

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check, **both themes** for the find screenshot:
  - Scratch copies of `fixtures/links.md` and `fixtures/gfm.md` in one folder (plus the other files
    `links.md` links to). Open `links.md`, click the new anchor link; show `gfm.md` is active and
    `__mdv.view.getState().topLine` is within 2 lines of the heading's line. Screenshot.
  - In `gfm.md` (Formatted), find a phrase that spans bold or a link (pick one from the fixture and
    say which); show the counter says at least `1 of 1` and screenshot the highlight.
  - Find timing on a scratch copy of `huge.md` (task 8, done by the supervisor).
- [ ] Commit: `Follow heading anchors in links and find across formatting`.

## Report

**Tests:** 316 → 331 (15 new tests: 6 in links.test.ts for anchor extraction, 2 in render.test.ts for headingLine, 7 in previewFind.test.ts for joinSegments/locateOffset and cross-node matching)

**Implementation:**
- Task 1-2: Modified `classifyLink` to extract and return heading anchors; added `headingLine` helper in `render.ts` to find the source line of a heading by id.
- Task 3: Updated `Preview.tsx` click handler to scroll to the heading after opening an anchor link to the same file. Uses `samePath` for comparison and `requestScrollToLine` to trigger scroll.
- Task 4: Added link `[Tables in gfm](gfm.md#table)` to links.md; verified heading id "table" exists via slugify of "Table".
- Tasks 5-7: Implemented `TextSegment`, `joinSegments`, and `locateOffset` helpers; rewrote `findInPreview` to search joined text (preserving block boundaries with newlines) and map matches back to DOM nodes. Now finds text spanning formatting nodes (e.g., "foo bar" across `foo <strong>bar</strong>`).

**Helper location:** Put `headingLine` in `render.ts` next to `extractHeadings` (not in links.ts) since it needs to parse markdown.

**Fixture heading used:** Table (slugifies to "table").
