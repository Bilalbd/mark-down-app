export type Eol = '\n' | '\r\n';

/** Converts any mix of CRLF / CR / LF to LF and reports the file's dominant line ending. */
export function normalizeEol(text: string): { text: string; eol: Eol } {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return { text: text.replace(/\r\n?/g, '\n'), eol: crlf > lf ? '\r\n' : '\n' };
}

/** Re-applies `eol` to LF-normalised text for writing to disk. */
export function applyEol(text: string, eol: Eol): string {
  return eol === '\n' ? text : text.replace(/\n/g, eol);
}
