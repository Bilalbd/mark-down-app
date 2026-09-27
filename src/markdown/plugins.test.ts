import { describe, expect, it } from 'vitest';
import { findHexColors, isHexColor, slugify } from './plugins';

describe('isHexColor', () => {
  it('accepts each valid length, case-insensitive', () => {
    expect(isHexColor('#abc')).toBe(true);
    expect(isHexColor('#ABCD')).toBe(true);
    expect(isHexColor('#aabbcc')).toBe(true);
    expect(isHexColor('#AABBCCDD')).toBe(true);
  });

  it('accepts an all-numeric 3/4-digit code (unlike findHexColors in plain text)', () => {
    expect(isHexColor('#123')).toBe(true);
    expect(isHexColor('#2024')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(isHexColor(' #abc ')).toBe(true);
  });

  it('rejects invalid lengths and non-hex characters', () => {
    expect(isHexColor('#ab')).toBe(false);
    expect(isHexColor('#abcde')).toBe(false);
    expect(isHexColor('#abcdefg')).toBe(false);
    expect(isHexColor('#abcdefghi')).toBe(false);
    expect(isHexColor('abc')).toBe(false);
    expect(isHexColor('#ggg')).toBe(false);
  });

  it('rejects a hostile value with trailing CSS or attribute syntax', () => {
    expect(isHexColor('#fff;background:url(x)')).toBe(false);
    expect(isHexColor('#abc"onmouseover=')).toBe(false);
  });
});

describe('findHexColors', () => {
  it('finds each valid length, case-insensitive', () => {
    const text = 'a #abc b #ABCD c #aabbcc d #AABBCCDD e';
    expect(findHexColors(text).map((m) => m.hex)).toEqual([
      '#abc',
      '#ABCD',
      '#aabbcc',
      '#AABBCCDD',
    ]);
  });

  it('skips all-numeric 3/4-digit codes but keeps them when a-f is present', () => {
    expect(findHexColors('issue #123 and #2024')).toEqual([]);
    expect(findHexColors('brand #a12 and year #2a24').map((m) => m.hex)).toEqual(['#a12', '#2a24']);
  });

  it('does not match a `#` following a letter, digit, `&` or `#`', () => {
    expect(findHexColors('C#')).toEqual([]);
    expect(findHexColors('&#123;')).toEqual([]);
    expect(findHexColors('##abc')).toEqual([]);
  });

  it('does not match a code followed by another letter/digit (too long)', () => {
    expect(findHexColors('#abcdefg')).toEqual([]);
    expect(findHexColors('#abcdefgh')).toEqual([]);
  });

  it('matches a code followed by punctuation', () => {
    expect(findHexColors('#ABC.').map((m) => m.hex)).toEqual(['#ABC']);
  });

  it('finds several codes in one string with correct index/length', () => {
    const text = 'x #fff y #000000 z';
    const matches = findHexColors(text);
    expect(matches).toEqual([
      { index: 2, length: 4, hex: '#fff' },
      { index: 9, length: 7, hex: '#000000' },
    ]);
  });

  it('rejects a hostile value with trailing CSS or attribute syntax', () => {
    // The stray `;` after "fff" is not a hex digit, so the run stops there and the swatch is
    // just for the harmless "#fff"; nothing from ";background:url(x)" reaches the match.
    expect(findHexColors('#fff;background:url(x)')).toEqual([{ index: 0, length: 4, hex: '#fff' }]);
    expect(findHexColors('#abc"onmouseover=')).toEqual([{ index: 0, length: 4, hex: '#abc' }]);
  });
});

// Regression guard: findHexColors/isHexColor must not affect slug generation (see
// render.test.ts for the full heading-id test using the real render pipeline).
describe('slugify (unaffected by hex swatches)', () => {
  it('keeps a HEX code in the slugified text', () => {
    expect(slugify('Brand #AA00BB')).toBe('brand-aa00bb');
  });
});
