# Phase 6: Suggest a file name when saving an untitled document

When an untitled document is saved, the Save dialog proposes `Untitled.md`. Propose a name taken
from the document instead: the first heading's text, or the first line if there's no heading, at
most 5 words.

## Rules (supervisor decision)

1. **Source text:** the text of the document's first heading (any level, ATX or setext) if it has
   one; otherwise the first non-empty line. A YAML front matter block at the very top (`---` …
   `---`) is skipped.
2. **Clean it:** drop Markdown syntax: leading `#`s, list markers (`-`, `*`, `+`, `1.`),
   blockquote `>`, task boxes (`[ ]`, `[x]`), emphasis and code markers (`*`, `_`, `~`, `` ` ``),
   links and images (`[text](url)` → `text`, `![alt](src)` → `alt`) and HTML tags.
3. **At most 5 words** (split on whitespace), joined with single spaces. Keep the original case.
4. **Make it a valid Windows file name:** remove `< > : " / \ | ? *` and control characters,
   collapse spaces, trim spaces and dots from both ends, and cap the name at 60 characters (cut at
   a word boundary where possible). If the result is a reserved device name (`CON`, `PRN`, `AUX`,
   `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, any case), or empty, use `Untitled`.
5. Add `.md`.
6. Only for **untitled** documents. A saved file's Save as keeps proposing its own path.

## Files

- `src/lib/fileName.ts`, `src/lib/fileName.test.ts` (new)
- `src/store/document.ts` (+ `document.test.ts`)
- `README.md`: one line where saving is described

## Tasks

- [ ] **1.** `src/lib/fileName.ts`: `suggestFileName(content: string, headingText: string | null):
  string`, pure, JSDoc. The caller passes the first heading's text (so this helper doesn't parse
  Markdown); the helper does rules 1 (front matter and first line), 2–5. Tests for every rule:
  heading wins over an earlier non-heading line; no heading → first line; front matter skipped;
  6+ words cut to 5; each Markdown construct stripped; each forbidden character removed; trailing
  dots; reserved names (`con`, `Com1`); empty/whitespace document → `Untitled.md`; non-Latin text
  (Arabic) kept; emoji kept; a 200-character line capped at 60.
- [ ] **2.** `document.ts` `saveAs`: when `path` is null, `defaultPath` is
  `suggestFileName(content, extractHeadings(content)[0]?.text ?? null)` (import `extractHeadings`
  from `@/markdown/render`; it's the cheap headings-only parse). Otherwise unchanged. Test in
  `document.test.ts` with the dialog plugin mocked: an untitled document whose first line is
  `# Meeting notes for Monday` calls the save dialog with `defaultPath: 'Meeting notes for
  Monday.md'`; a saved document still passes its own path.
- [ ] **3.** Closing an untitled tab and choosing Save goes through `saveAs`, so it gets the same
  suggestion. Check that it does (read the code path; add a test only if it's a different path).
- [ ] **4.** README: mention that saving a new note suggests a name from its first heading or line.

## Verify

- [ ] `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `pnpm format`.
- [ ] Manual check: New note (Ctrl+N), type `# Weekly plan: Q4 goals and more words` (set it from
  eval), then call `window.__mdv.document.getState().saveAs()` from eval without awaiting it. The
  native Save dialog opens; CDP can't see it, so find the dialog window (class `#32770`) owned by the
  `markdown-viewer` process with `EnumWindows` and capture it with `PrintWindow` from PowerShell,
  then read the **File name** box in the screenshot (expect `Weekly plan Q4 goals and.md`: the
  colon is removed and only 5 words are kept). Close the dialog with `WM_CLOSE` (`PostMessage`) so
  nothing is saved. Repeat with a note that has no heading. If you can't capture the dialog, say so
  plainly; don't describe the check as done.
- [ ] Commit: `Suggest a file name from the first heading or line when saving`.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
