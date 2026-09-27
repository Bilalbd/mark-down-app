import type { Encoding } from '@/lib/tauri';
import type { Eol } from '@/lib/eol';

/** Counts runs of letters or digits, where apostrophes join parts into single words. */
export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:[''][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

/** Counts lines: 1 for empty string, otherwise number of newlines + 1. */
export function countLines(text: string): number {
  return text === '' ? 1 : (text.match(/\n/g)?.length ?? 0) + 1;
}

/** Formats an encoding identifier for display (e.g. 'utf8' → 'UTF-8'). */
export function formatEncoding(encoding: Encoding): string {
  switch (encoding) {
    case 'utf8':
      return 'UTF-8';
    case 'utf8-bom':
      return 'UTF-8 with BOM';
    case 'utf16-le':
      return 'UTF-16 LE';
    case 'utf16-be':
      return 'UTF-16 BE';
  }
}

/** Formats a line ending identifier for display (e.g. '\n' → 'LF'). */
export function formatEol(eol: Eol): string {
  switch (eol) {
    case '\n':
      return 'LF';
    case '\r\n':
      return 'CRLF';
  }
}

/** Formats a number with thousands separators using locale-aware formatting. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-GB');
}
