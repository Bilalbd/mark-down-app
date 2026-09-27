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
- The swatch goes **after** the code, separated by a small gap.

## Files

- `src/markdown/plugins.ts` (+ `render.test.ts` or a new `plugins.test.ts`): the markdown-it rule
- `src/markdown/render.ts`: register the plugin and its renderer rule
- `src/markdown/sanitize.test.ts`: the swatch survives sanitising
- `src/components/Preview/Preview.css`: the swatch style
- `fixtures/colors.md` (new)
- `README.md`: one line in the features list

## Tasks

- [ ] **1.** Pure helper in `plugins.ts`, exported with JSDoc and unit-tested:
  `findHexColors(text: string): { index: number; length: number; hex: string }[]` for plain text,
  and `isHexColor(text: string): boolean` for inline code. Tests: each valid length; 3/4-digit
  all-number codes skipped in plain text but accepted by `isHexColor`; `C#`, `&#123;`, `##abc`,
  `#abcdefg` (too long / followed by a letter), `#ABC.` (followed by punctuation: matches),
  several codes in one string, lowercase and uppercase.
- [ ] **2.** A markdown-it core rule `hex_swatches` (after `inline`): for every `inline` token,
  walk its `children`, tracking link depth. After a matching `code_inline`, insert a new token of
  type `color_swatch` with `meta: { hex }`. For a `text` token with matches, split it into `text`
  tokens around each code and insert a `color_swatch` token after each code (keep the code's text
  in the text token so the text reads the same). Register the rule in `render.ts` with `.use()`.
- [ ] **3.** Renderer rule for `color_swatch`: `<span class="color-swatch" style="--swatch: #aabbcc"
  aria-hidden="true"></span>`. Re-validate `hex` with `isHexColor` before writing it (defence in
  depth; nothing but `#` and hex digits may reach the attribute).
- [ ] **4.** Heading ids must not change: `heading_ids` builds ids from `text`/`code_inline`
  children. Add a test that `## Brand #AA00BB` gets the same id as before this phase, and that
  `extractHeadings` text is unchanged.
- [ ] **5.** `sanitize.test.ts`: a rendered swatch keeps its `class`, its `style` with the custom
  property, and `aria-hidden`.
- [ ] **6.** `Preview.css`: `.preview .color-swatch { display: inline-block; width: 0.8em;
  height: 0.8em; margin-left: 0.3em; vertical-align: -0.05em; border-radius: 2px;
  background: var(--swatch); box-shadow: 0 0 0 1px var(--md-border); }` (the outline keeps white
  swatches visible on light themes and black ones on dark themes). Tune `vertical-align` so the
  square sits centred on the text in both a paragraph and inline code, and say what you chose.
- [ ] **7.** `fixtures/colors.md`: inline code in each length and case, plain-text codes in a
  sentence, the non-matches listed in Rules, a code inside a link, a heading with a code, a table
  with codes, a fenced block with codes (no swatches there), and `#fff`/`#000` to check the outline.
- [ ] **8.** Check that export keeps the swatches: `export.ts` embeds `Preview.css`, so an exported
  file shows them too. Check Find in the preview still finds `#AA00BB` (the swatch span is empty, so
  it shouldn't interfere).

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check in **light and dark** on a copy of `fixtures/colors.md`: crop and enlarge several
  swatches in a paragraph, in inline code, in a table and in a heading; they're square, text-height,
  centred, outlined, and every non-match in the fixture has no swatch. Export HTML and open it (or
  read it) to confirm the swatches are there. Check `fixtures/huge.md` still renders at the same
  speed (time `renderMarkdown` on it before and after from eval).
- [ ] Commit: `Show a colour swatch next to HEX colour codes`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
