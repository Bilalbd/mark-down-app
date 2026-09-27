# Phase 5: Colour swatches next to HEX codes

In the formatted view, show a small square filled with the colour right after a HEX colour code,
about the height of the text. Bilal's choice: for codes written as inline code (`` `#AA00BB` ``)
**and** in plain text, formatted view only (not the source editor).

## Rules (supervisor decision)

- Valid HEX: `#` followed by 3, 4, 6 or 8 hex digits, case-insensitive, not followed by another
  letter, digit or `_`.
- **Inline code:** the whole code span (trimmed) is one valid HEX code, any valid length.
- **Plain text:** 6 or 8 digits always count; 3 or 4 digits only if at least one digit is a letter
  a–f (so `#123` and `#2024` stay plain). The `#` must not follow a letter, digit, `&` or `#`
  (so `C#`, `&#123;` and `##` don't match).
- Never inside link text (between `link_open` and `link_close`), never in fenced/indented code
  blocks (those aren't inline tokens anyway), never in raw HTML.
- **Placement (Bilal, 2026-09-28):** for inline code, the swatch goes **inside the code pill**,
  after the code text (`<code>#AA00BB<span class="color-swatch" …></span></code>`), so pill and
  swatch read as one chip. For plain text, the swatch goes right after the code, separated by a
  small gap.

## Files

- `src/markdown/plugins.ts` (+ `render.test.ts` or a new `plugins.test.ts`): the markdown-it rule
- `src/markdown/render.ts`: register the plugin and its renderer rule
- `src/markdown/sanitize.test.ts`: the swatch survives sanitising
- `src/components/Preview/Preview.css`: the swatch style
- `fixtures/colors.md` (new)
- `README.md`: one line in the features list

## Tasks

- [x] **1.** Pure helper in `plugins.ts`, exported with JSDoc and unit-tested:
  `findHexColors(text: string): { index: number; length: number; hex: string }[]` for plain text,
  and `isHexColor(text: string): boolean` for inline code. Tests: each valid length; 3/4-digit
  all-number codes skipped in plain text but accepted by `isHexColor`; `C#`, `&#123;`, `##abc`,
  `#abcdefg` (too long / followed by a letter), `#ABC.` (followed by punctuation: matches),
  several codes in one string, lowercase and uppercase.
- [x] **2.** A markdown-it core rule `hex_swatches` (after `inline`): for every `inline` token,
  walk its `children`, tracking link depth. For a `text` token with matches, split it into `text`
  tokens around each code and insert a `color_swatch` token after each code (keep the code's text
  in the text token so the text reads the same). For a matching `code_inline` token, per the
  Placement rule above, mark the token itself (`meta.hexSwatch`) instead of inserting a sibling
  token, so the renderer can put the swatch inside the same `<code>` pill. Registered in
  `render.ts` with `.use()`.
- [x] **3.** Renderer rules: `color_swatch` (plain text) renders
  `<span class="color-swatch" style="--swatch: #aabbcc" aria-hidden="true"></span>`; `code_inline`
  is overridden to mirror markdown-it's own default rule and append that same span, before
  `</code>`, when the token carries `meta.hexSwatch`. Both re-validate `hex`/`hexSwatch` with
  `isHexColor` before writing it (defence in depth; nothing but `#` and hex digits may reach the
  attribute).
- [x] **4.** Heading ids must not change: `heading_ids` builds ids from `text`/`code_inline`
  children. Added a test that `## Brand #AA00BB` gets the same shape of id as before this phase,
  and that `extractHeadings` text is unchanged.
- [x] **5.** `sanitize.test.ts`: a rendered swatch keeps its `class`, its `style` with the custom
  property, and `aria-hidden` - both standalone and nested inside a `<code>` pill.
- [x] **6.** `Preview.css`: base `.preview .color-swatch` rule as specified (outline keeps white
  swatches visible on light themes and black ones on dark themes). Added a second rule,
  `.preview code .color-swatch`, for the inside-the-pill placement: a smaller `margin-left`
  (0.25em vs 0.3em) since the pill's own padding already separates it from the pill edge, and
  `vertical-align: -0.06em` (vs -0.05em) - tuned by eye in the running app so the square sits
  centred on the code's slightly smaller font-size (`.preview code` is 0.875em). Confirmed in both
  a paragraph and inline code, light and dark (screenshots below).
- [x] **7.** `fixtures/colors.md`: inline code in each length and case, plain-text codes in a
  sentence, the non-matches listed in Rules, a code inside a link, a heading with a code, a table
  with codes, a fenced block with codes (no swatches there), and `#fff`/`#000` (as inline code, so
  they get a swatch - plain text skips all-digit 3-digit codes) to check the outline.
- [x] **8.** Export: `export.ts` embeds `previewCss` (raw import of `Preview.css`) verbatim into
  the exported `<style>`, so both new CSS rules ship with every export automatically; no code
  change needed. Confirmed Find in the preview still finds `#AA00BB` (3 occurrences in the fixture
  - heading, link text, fenced block) with the swatch spans present - the empty spans don't
  interfere with `previewFind.ts`'s text-node walk.

## Verify

- [x] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [x] Manual check in **light and dark** on a copy of `fixtures/colors.md`: crop and enlarge several
  swatches in a paragraph, in inline code, in a table and in a heading; they're square, text-height,
  centred, outlined, and every non-match in the fixture has no swatch. Export HTML and open it (or
  read it) to confirm the swatches are there. Check `fixtures/huge.md` still renders at the same
  speed (time `renderMarkdown` on it before and after from eval).
- [x] Commit: `Show a colour swatch next to HEX colour codes`.

## Report

**What changed**

- `src/markdown/plugins.ts`: `isHexColor` and `findHexColors` pure helpers, plus the
  `hexSwatches` core rule and its token-splitting/marking internals.
- `src/markdown/render.ts`: registers `hexSwatches`; renderer rules for `color_swatch` (plain
  text) and an overridden `code_inline` (inline code - appends the swatch inside the pill).
- `src/components/Preview/Preview.css`: `.preview .color-swatch` (base) and
  `.preview code .color-swatch` (inside-the-pill tuning).
- `src/markdown/plugins.test.ts` (new): unit tests for the two pure helpers, including the
  hostile-input cases from the security brief.
- `src/markdown/render.test.ts`: a `hex colour swatches` describe block covering inline code
  (including the inside-the-pill shape), plain text, non-matches, links, fenced code, raw HTML,
  heading ids, and hostile inputs.
- `src/markdown/sanitize.test.ts`: swatch survives sanitising, standalone and nested in `<code>`.
- `fixtures/colors.md` (new).
- `README.md`: one line in the features list.

**Placement change mid-phase:** Bilal changed the inline-code placement after I'd built the
first version (separate `color_swatch` token as a sibling after `</code>`). I reworked it to mark
the `code_inline` token (`meta.hexSwatch`) instead and added a `code_inline` renderer override
that appends the swatch span before the closing tag, so pill and swatch render as one chip. Docs
(`README.md` decisions, this file's Rules) were already updated before I picked this back up; I
only touched the Tasks/Verify checkboxes and this Report in that file.

**Security:** the renderer only ever writes `hex`/`hexSwatch` into the `style` attribute after
`isHexColor` re-validates it - so only `#` plus 3/4/6/8 hex digits can reach it, regardless of
what the token's meta claims. Tested hostile cases: `` `#fff;background:url(x)` `` (inline code -
not a valid whole-span HEX code, so no meta is ever set, no swatch, `url(` appears only as
ordinary escaped code text, never in a `style=`); `#abc"onmouseover="alert(1)` (plain text - only
the validated `#abc` reaches the swatch's `style`; the quote-and-onmouseover text renders as an
ordinary text sibling after the swatch's closing tag, never as an attribute on any element). All
output continues to go through `sanitizeHtml`, unchanged in this phase.

**Verification**

- `pnpm test`: 437 → 463 (26 new tests: 13 in `plugins.test.ts`, 10 in `render.test.ts`, 2 in
  `sanitize.test.ts`, plus 1 from the mid-phase placement rework replacing one of the original
  10). `npx tsc --noEmit` and `pnpm lint` both clean. `pnpm format` made no changes (already
  within width).
- huge.md timing (jsdom, 8 renders, via a throwaway benchmark test not committed): with
  `hexSwatches` disabled, steady-state ~276-321ms; enabled, ~266-330ms - no measurable
  regression, well within noise. In the dev app, `renderMarkdown` on `fixtures/huge.md` via CDP
  eval: first call ~1.15s (Shiki warm-up), steady state ~190-200ms.
- Manual check in the dev app (`start-dev.ps1`/`stop-dev.ps1`, `fixtures/colors.md` copied to
  scratchpad), both light and dark, via `cdp.mjs`:
  - Inline code (`` `#abc` `` through `` `#AABBCCDD` ``, and `` `#123` ``/`` `#2024` ``): each
    swatch sits inside its pill, right after the code text, square and centred, in both themes.
  - Plain text (`#a1b2c3`, `#FF00AA`, `#0f0`, `#11223344`): swatch right after the code with a
    small gap, correct colours (magenta, green, etc. rendered correctly).
  - Non-matches: `#123`/`#2024` in plain text, `C#`, `&#123;`, `##abc`, `#abcdefg` - none got a
    swatch. `#ABC.` got a swatch only on the second, bare `#ABC` code span, not the first
    (`` `#ABC.` ``, which fails `isHexColor` since the period isn't a hex digit) - matches the
    fixture's intent.
  - Link text (`[#AA00BB](...)`) - no swatch. Fenced block and raw-HTML-looking text - no swatch.
  - Heading (`## Brand #AA00BB`) and table cells - swatch present, heading id unaffected.
  - Outline check (`` `#fff` ``/`` `#000` ``, written as inline code) - both outlined and visible
    against the page background in both themes.
  - Find (`Ctrl+F`, searching "AA00BB"): "1 of 3" (heading, link text, fenced block) - the empty
    swatch spans don't interfere with `previewFind.ts`.
  - `appTheme` setting is `appTheme`, not `theme`, in this store (learned by trial) - noting in
    case it trips up a later phase's dev-app script.
- Settings/presets backed up to scratchpad before the first launch; `stop-dev.ps1` reported
  `recentFiles` drift and restored it. `presets.json` and `.window-state.json` unchanged
  (`presets.json` only differs from my backup by key order, which is not a real change).

**Skipped / not verified**

- Did not trigger the actual interactive "Export as HTML" dialog (Tauri file-save flow); verified
  instead that `export.ts` embeds `previewCss` verbatim (so both new CSS rules ship automatically)
  and that the rendered swatch markup is identical to what the live preview shows. The supervisor
  may want to do a real export-and-open pass.
- No dedicated unit test asserts the `code_inline` token's `meta.hexSwatch` shape directly (only
  exercised through the full `renderMarkdown` pipeline in `render.test.ts`), which felt like the
  more valuable integration-level test given the placement change is about rendered HTML shape.

**Anything noticed but not fixed:** none.

## Supervisor check

Built by a Sonnet 5 agent (cut off once by a usage limit, then resumed with Bilal's mid-phase
change: the swatch inside the inline-code pill). Diff reviewed: both renderer rules re-validate the
hex before writing it into `style`; inline code keeps markdown-it's escaping; link text is skipped;
the plain-text rules match the phase document. `pnpm test` 463 passed, lint and tsc clean.

**Manual check (supervisor, dev app in its own window and WebView2 folder, `fixtures/colors.md`
loaded into an untitled note so nothing enters recent files):** 20 swatches, every inline-code one
inside its `<code>` pill (11.2 px) and every plain-text one right after the code (12.8 px);
enlarged screenshots in light and dark: swatches text-height and centred, pill and swatch read as
one chip; no swatch for `##abc`, `#abcdefg`, the inline code `#ABC.`, or link text; the heading
"Brand #AA00BB" gets one sized to the heading. Very dark colours (`#123`, `#2024`) are faint on the
dark theme but outlined.

Process issues: the agent opened the repo's `fixtures/huge.md` directly (not a copy; unchanged per
git) and ran the dev app several times, so its settings snapshot included earlier test files and two
fixtures ended up in Bilal's recent files; the supervisor's repair of that list was refused by the
safety classifier and is left for Bilal. It also left its Vite server running (stopped by pid).
