import { describe, expect, it } from 'vitest';
import { applyEol, normalizeEol } from '@/lib/eol';

describe('normalizeEol', () => {
  it('handles pure LF', () => {
    expect(normalizeEol('a\nb\nc')).toEqual({ text: 'a\nb\nc', eol: '\n' });
  });

  it('handles pure CRLF', () => {
    expect(normalizeEol('a\r\nb\r\nc')).toEqual({ text: 'a\nb\nc', eol: '\r\n' });
  });

  it('picks the dominant ending in a mixed file', () => {
    expect(normalizeEol('a\r\nb\r\nc\n')).toEqual({ text: 'a\nb\nc\n', eol: '\r\n' });
    expect(normalizeEol('a\nb\nc\r\n')).toEqual({ text: 'a\nb\nc\n', eol: '\n' });
  });

  it('normalises a lone CR', () => {
    expect(normalizeEol('a\rb')).toEqual({ text: 'a\nb', eol: '\n' });
  });
});

describe('applyEol', () => {
  it('is a no-op for LF', () => {
    expect(applyEol('a\nb', '\n')).toBe('a\nb');
  });

  it('converts LF to CRLF', () => {
    expect(applyEol('a\nb', '\r\n')).toBe('a\r\nb');
  });

  it('round-trips a pure-CRLF input', () => {
    const original = 'a\r\nb\r\nc\r\n';
    const { text, eol } = normalizeEol(original);
    expect(applyEol(text, eol)).toBe(original);
  });
});
