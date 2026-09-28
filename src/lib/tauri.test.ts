import { describe, expect, it } from 'vitest';
import { spellCheck, spellLanguages, spellSuggest } from '@/lib/tauri';

// These wrappers must be safe when Tauri isn't there (plain Vite dev, or tests): `isTauri()`
// is false in jsdom, since `window.__TAURI_INTERNALS__` is never set here.
describe('spell check wrappers outside Tauri', () => {
  it('spellLanguages resolves to an empty list', async () => {
    await expect(spellLanguages()).resolves.toEqual([]);
  });

  it('spellCheck resolves to one empty list per text', async () => {
    await expect(spellCheck(['one', 'two', 'three'], ['en-US'])).resolves.toEqual([[], [], []]);
  });

  it('spellCheck resolves to an empty array for no texts', async () => {
    await expect(spellCheck([], ['en-US'])).resolves.toEqual([]);
  });

  it('spellSuggest resolves to an empty list', async () => {
    await expect(spellSuggest('tset', ['en-US'])).resolves.toEqual([]);
  });
});
