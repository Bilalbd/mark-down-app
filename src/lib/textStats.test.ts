import { describe, expect, it } from 'vitest';
import { countWords, countLines, formatEncoding, formatEol, formatCount } from './textStats';

describe('textStats', () => {
  describe('countWords', () => {
    it('counts simple words', () => {
      expect(countWords('hello world')).toBe(2);
    });

    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('returns 0 for spaces only', () => {
      expect(countWords('   ')).toBe(0);
    });

    it('ignores Markdown syntax', () => {
      expect(countWords('# # *bold* `code`')).toBe(2);
    });

    it('handles apostrophes correctly', () => {
      expect(countWords("don't can't")).toBe(2);
    });

    it('handles non-Latin text', () => {
      expect(countWords('مرحبا hello 你好')).toBe(3);
    });

    it('counts digits as words', () => {
      expect(countWords('123 456')).toBe(2);
    });

    it('counts CJK runs', () => {
      expect(countWords('你好世界')).toBe(1);
    });
  });

  describe('countLines', () => {
    it('returns 1 for empty string', () => {
      expect(countLines('')).toBe(1);
    });

    it('returns 1 for single line', () => {
      expect(countLines('hello')).toBe(1);
    });

    it('counts newlines', () => {
      expect(countLines('line1\nline2\nline3')).toBe(3);
    });

    it('handles trailing newline', () => {
      expect(countLines('line1\nline2\n')).toBe(3);
    });
  });

  describe('formatEncoding', () => {
    it('formats utf8', () => {
      expect(formatEncoding('utf8')).toBe('UTF-8');
    });

    it('formats utf8-bom', () => {
      expect(formatEncoding('utf8-bom')).toBe('UTF-8 with BOM');
    });

    it('formats utf16-le', () => {
      expect(formatEncoding('utf16-le')).toBe('UTF-16 LE');
    });

    it('formats utf16-be', () => {
      expect(formatEncoding('utf16-be')).toBe('UTF-16 BE');
    });
  });

  describe('formatEol', () => {
    it('formats LF', () => {
      expect(formatEol('\n')).toBe('LF');
    });

    it('formats CRLF', () => {
      expect(formatEol('\r\n')).toBe('CRLF');
    });
  });

  describe('formatCount', () => {
    it('formats small numbers', () => {
      expect(formatCount(123)).toBe('123');
    });

    it('adds thousands separators', () => {
      expect(formatCount(1234)).toBe('1,234');
    });

    it('handles large numbers', () => {
      expect(formatCount(1234567)).toBe('1,234,567');
    });
  });
});
