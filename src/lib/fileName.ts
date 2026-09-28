// Windows disallows these characters in file names, plus C0 control characters.
const FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

const RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const MAX_LENGTH = 60;

/** Strips a link/image target, keeping only its text/alt: `[text](url)` or `![alt](src)` → text/alt. */
function stripLinksAndImages(text: string): string {
  return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
}

/** Repeatedly strips one leading block marker (heading `#`s, a list marker, or `>`), so nested
 * markers like `> - ` are all removed. */
function stripLeadingBlockMarkers(text: string): string {
  const LEADING_MARKER = /^\s*(?:#{1,6}\s+|(?:[-*+]|\d+\.)\s+|>\s*)/;
  let s = text;
  let previous: string;
  do {
    previous = s;
    s = s.replace(LEADING_MARKER, '');
  } while (s !== previous);
  return s;
}

/** Drops Markdown syntax from a line of source text: headings, list/quote/task markers,
 * emphasis and code markers, links, images and HTML tags. */
function stripMarkdownSyntax(text: string): string {
  let s = stripLinksAndImages(text);
  s = s.replace(/<[^>]+>/g, '');
  s = stripLeadingBlockMarkers(s);
  s = s.replace(/^\[[ xX]\]\s*/, '');
  s = s.replace(/[*_~`]/g, '');
  return s;
}

/** Removes characters Windows doesn't allow in file names, collapses whitespace, trims spaces
 * and dots from both ends, caps the length (cutting at a word boundary where possible), and
 * falls back to `Untitled` for a reserved device name or an empty result. */
function toWindowsSafeName(text: string): string {
  let s = text.replace(FORBIDDEN_CHARS, '');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/^[ .]+|[ .]+$/g, '');
  if (s.length > MAX_LENGTH) {
    const cut = s.slice(0, MAX_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    s = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
    s = s.replace(/^[ .]+|[ .]+$/g, '');
  }
  if (s === '' || RESERVED_NAMES.has(s.toUpperCase())) {
    return 'Untitled';
  }
  return s;
}

/** The first non-empty line of `content`, skipping a leading YAML front matter block
 * (`---` … `---`). Returns '' if the document is empty or has no non-empty line. */
function firstNonEmptyLine(content: string): string {
  const lines = content.split('\n');
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const closeIdx = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (closeIdx !== -1) start = closeIdx + 1;
  }
  for (let i = start; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed !== '') return trimmed;
  }
  return '';
}

/**
 * Suggests a file name for an untitled document being saved: the first heading's text if given,
 * otherwise the document's first non-empty line (front matter skipped); Markdown syntax
 * stripped; at most 5 words; made a valid Windows file name; `.md` appended. Falls back to
 * `Untitled.md` when there's nothing usable.
 *
 * The caller does the (cheap) Markdown parsing to find the first heading — this helper only
 * cleans up plain text — so pass `headingText` from `extractHeadings(content)[0]?.text ?? null`.
 */
export function suggestFileName(content: string, headingText: string | null): string {
  const source = headingText !== null ? headingText : firstNonEmptyLine(content);
  const cleaned = stripMarkdownSyntax(source).trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  return `${toWindowsSafeName(words)}.md`;
}
