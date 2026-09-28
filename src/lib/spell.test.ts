import { describe, expect, it } from 'vitest';
import { effectiveSpellLanguages, isKnownWord, languageLabel, SpellCache } from './spell';
import type { SpellError } from '@/lib/tauri';

describe('effectiveSpellLanguages', () => {
  const supported = ['ar-SA', 'en-CA', 'en-PH', 'en-US', 'fr-FR'];

  it('returns the saved list unchanged once the user has chosen one', () => {
    expect(effectiveSpellLanguages(['ar-SA'], supported, 'en-US')).toEqual(['ar-SA']);
    expect(effectiveSpellLanguages(['en-CA', 'fr-FR'], supported, 'en-US')).toEqual([
      'en-CA',
      'fr-FR',
    ]);
  });

  it('picks the exact tag match automatically', () => {
    expect(effectiveSpellLanguages([], supported, 'fr-FR')).toEqual(['fr-FR']);
  });

  it('is case-insensitive for the exact match', () => {
    expect(effectiveSpellLanguages([], supported, 'EN-US')).toEqual(['en-US']);
  });

  it('falls back to the same primary language, preferring en-US', () => {
    // en-GB has no exact match; en-CA/en-PH/en-US all share the "en" primary - en-US wins.
    expect(effectiveSpellLanguages([], supported, 'en-GB')).toEqual(['en-US']);
  });

  it('falls back to the first same-primary tag when en-US is not among them', () => {
    const noEnUs = ['en-CA', 'en-PH'];
    expect(effectiveSpellLanguages([], noEnUs, 'en-GB')).toEqual(['en-CA']);
  });

  it('falls back to en-US when no same-primary tag is supported', () => {
    expect(effectiveSpellLanguages([], supported, 'de-DE')).toEqual(['en-US']);
  });

  it('falls back to the first supported tag when en-US is not supported either', () => {
    const noEnglish = ['ar-SA', 'fr-FR'];
    expect(effectiveSpellLanguages([], noEnglish, 'de-DE')).toEqual(['ar-SA']);
  });

  it('returns no language when nothing is supported', () => {
    expect(effectiveSpellLanguages([], [], 'en-US')).toEqual([]);
  });
});

describe('languageLabel', () => {
  it('names a language tag in the given UI language', () => {
    // The exact wording is ICU's (varies by platform/Node version - e.g. "American English"
    // or "English (United States)"), so only the language name itself is asserted here.
    expect(languageLabel('en-US', 'en-US')).toContain('English');
    expect(languageLabel('ar-SA', 'en-US')).toContain('Arabic');
  });

  it('falls back to the tag itself for an unrecognised tag', () => {
    expect(languageLabel('not-a-tag', 'en-US')).toBe('not-a-tag');
  });
});

describe('isKnownWord', () => {
  it('matches the personal dictionary case-insensitively', () => {
    expect(isKnownWord('Teh', ['teh'], new Set())).toBe(true);
    expect(isKnownWord('teh', ['Teh'], new Set())).toBe(true);
    expect(isKnownWord('other', ['teh'], new Set())).toBe(false);
  });

  it('matches the ignore set case-insensitively', () => {
    expect(isKnownWord('Wiht', [], new Set(['wiht']))).toBe(true);
    expect(isKnownWord('WIHT', [], new Set(['wiht']))).toBe(true);
    expect(isKnownWord('other', [], new Set(['wiht']))).toBe(false);
  });
});

function err(start: number, length: number): SpellError {
  return { start, length, kind: 'misspelled' };
}

describe('SpellCache', () => {
  it('misses until a value is set, then hits', () => {
    const cache = new SpellCache();
    expect(cache.get(['en-US'], 'hello')).toBeUndefined();
    const errors = [err(0, 5)];
    cache.set(['en-US'], 'hello', errors);
    expect(cache.get(['en-US'], 'hello')).toEqual(errors);
  });

  it('keys on languages regardless of order', () => {
    const cache = new SpellCache();
    cache.set(['ar-SA', 'en-US'], 'text', [err(0, 4)]);
    expect(cache.get(['en-US', 'ar-SA'], 'text')).toEqual([err(0, 4)]);
  });

  it('keeps different texts and different language sets apart', () => {
    const cache = new SpellCache();
    cache.set(['en-US'], 'a', [err(0, 1)]);
    cache.set(['ar-SA'], 'a', [err(0, 2)]);
    cache.set(['en-US'], 'b', [err(0, 3)]);
    expect(cache.get(['en-US'], 'a')).toEqual([err(0, 1)]);
    expect(cache.get(['ar-SA'], 'a')).toEqual([err(0, 2)]);
    expect(cache.get(['en-US'], 'b')).toEqual([err(0, 3)]);
  });

  it('clears when asked', () => {
    const cache = new SpellCache();
    cache.set(['en-US'], 'a', []);
    cache.clear();
    expect(cache.get(['en-US'], 'a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('clears itself outright once it would exceed its cap', () => {
    const cache = new SpellCache();
    // Fill just under the cap, then push it over: the whole cache resets rather than evicting
    // one entry at a time.
    for (let i = 0; i < 5000; i++) cache.set(['en-US'], `word${i}`, []);
    expect(cache.size).toBe(5000);
    cache.set(['en-US'], 'overflow', [err(0, 1)]);
    expect(cache.size).toBe(1);
    expect(cache.get(['en-US'], 'word0')).toBeUndefined();
    expect(cache.get(['en-US'], 'overflow')).toEqual([err(0, 1)]);
  });
});
