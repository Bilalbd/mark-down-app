import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readClipboardText,
  spellCheck,
  spellLanguages,
  spellSuggest,
  writeClipboardText,
} from '@/lib/tauri';

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

describe('clipboard wrappers outside Tauri', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('writeClipboardText falls back to navigator.clipboard.writeText', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await writeClipboardText('hello');

    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('readClipboardText falls back to navigator.clipboard.readText', async () => {
    const readText = vi.fn(() => Promise.resolve('clipboard contents'));
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });

    await expect(readClipboardText()).resolves.toBe('clipboard contents');
    expect(readText).toHaveBeenCalled();
  });
});
