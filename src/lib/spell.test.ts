import { describe, expect, it } from 'vitest';
import {
  effectiveSpellLanguages,
  isKnownWord,
  languageCode,
  languageLabel,
  spellLanguageGroups,
  SpellCache,
} from './spell';
import type { SpellError } from '@/lib/tauri';

describe('languageCode', () => {
  it('extracts the primary subtag, lowercased', () => {
    expect(languageCode('en-US')).toBe('en');
    expect(languageCode('EN-US')).toBe('en');
    expect(languageCode('ar-SA')).toBe('ar');
    expect(languageCode('fr')).toBe('fr');
  });
});

describe('spellLanguageGroups', () => {
  it('groups tags by language code and picks preferred tags', () => {
    const supported = ['ar-EG', 'ar-SA', 'en-CA', 'en-US'];
    const groups = spellLanguageGroups(supported, 'en-US');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ code: 'ar', tag: 'ar-SA' }); // ar-SA is Bilal's choice
    expect(groups[1]).toEqual({ code: 'en', tag: 'en-US' }); // en-US is Bilal's choice
  });

  it('uses likely region for non-special languages', () => {
    const supported = ['fr-CA', 'fr-FR'];
    const groups = spellLanguageGroups(supported, 'en-US');
    const frGroup = groups.find((g) => g.code === 'fr');
    expect(frGroup?.tag).toBe('fr-FR'); // fr's likely region is FR
  });

  it('falls back to first tag alphabetically when likely region is not installed', () => {
    const supported = ['en-CA', 'en-GB'];
    const groups = spellLanguageGroups(supported, 'en-US');
    const enGroup = groups.find((g) => g.code === 'en');
    expect(enGroup?.tag).toBe('en-CA'); // en-US (likely region US) is not available, so alphabetically first
  });

  it('sorts groups by language label', () => {
    const supported = ['en-US', 'ar-SA', 'fr-FR'];
    const groups = spellLanguageGroups(supported, 'en-US');
    const labels = groups.map((g) => languageLabel(g.code, 'en-US'));
    // Arabic should come before English and French alphabetically
    expect(labels[0]).toContain('Arabic');
  });
});

describe('effectiveSpellLanguages', () => {
  const supported = ['ar-SA', 'en-CA', 'en-PH', 'en-US', 'fr-FR'];

  it('converts language codes to their preferred tags, preserving input order', () => {
    expect(effectiveSpellLanguages(['en', 'ar'], supported, 'en-US')).toEqual(['en-US', 'ar-SA']);
    expect(effectiveSpellLanguages(['ar', 'en'], supported, 'en-US')).toEqual(['ar-SA', 'en-US']);
  });

  it('normalises old regional tags to language codes, deduplicating', () => {
    expect(effectiveSpellLanguages(['en-US', 'en-CA'], supported, 'en-US')).toEqual(['en-US']);
    expect(effectiveSpellLanguages(['ar-EG', 'ar-SA'], supported, 'en-US')).toEqual(['ar-SA']);
  });

  it('skips a saved code that is no longer installed', () => {
    // 'de' is not in supported, so it's dropped
    expect(effectiveSpellLanguages(['en', 'de'], supported, 'en-US')).toEqual(['en-US']);
  });

  it('automatically picks navLang primary subtag if installed', () => {
    expect(effectiveSpellLanguages([], supported, 'fr-CA')).toEqual(['fr-FR']);
  });

  it('automatically falls back to en if navLang is not installed', () => {
    expect(effectiveSpellLanguages([], supported, 'de-DE')).toEqual(['en-US']);
  });

  it('automatically uses the first language if en is not installed', () => {
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
