import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guidePath,
  readClipboardText,
  settingsFolder,
  spellCheck,
  spellLanguages,
  spellSuggest,
  writeClipboardText,
} from '@/lib/tauri';

vi.mock('@tauri-apps/api/path', () => ({ resolveResource: vi.fn(), appDataDir: vi.fn() }));

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

describe('settingsFolder outside Tauri', () => {
  it('resolves to null', async () => {
    await expect(settingsFolder()).resolves.toBeNull();
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

describe('guidePath', () => {
  beforeEach(async () => {
    const { resolveResource } = await import('@tauri-apps/api/path');
    vi.mocked(resolveResource).mockReset();
  });

  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('resolves to null outside Tauri, without calling resolveResource', async () => {
    const { resolveResource } = await import('@tauri-apps/api/path');
    await expect(guidePath()).resolves.toBeNull();
    expect(resolveResource).not.toHaveBeenCalled();
  });

  it('resolves the bundled resource path inside Tauri, and caches it', async () => {
    const { resolveResource } = await import('@tauri-apps/api/path');
    vi.mocked(resolveResource).mockResolvedValue(
      'C:\\Program Files\\Markdown\\resources\\guide\\Guide.md',
    );
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    await expect(guidePath()).resolves.toBe(
      'C:\\Program Files\\Markdown\\resources\\guide\\Guide.md',
    );
    await expect(guidePath()).resolves.toBe(
      'C:\\Program Files\\Markdown\\resources\\guide\\Guide.md',
    );
    expect(resolveResource).toHaveBeenCalledTimes(1); // cached, not re-resolved
    expect(resolveResource).toHaveBeenCalledWith('resources/guide/Guide.md');
  });
});
