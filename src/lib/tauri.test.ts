import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import {
  emitGuideReady,
  openGuideWindow,
  readClipboardText,
  settingsFolder,
  spellCheck,
  spellLanguages,
  spellSuggest,
  writeClipboardText,
} from '@/lib/tauri';

vi.mock('@tauri-apps/api/path', () => ({ appDataDir: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));

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

describe('guide window wrappers', () => {
  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.mocked(invoke).mockReset();
    vi.mocked(emit).mockReset();
  });

  it('openGuideWindow does nothing outside Tauri', async () => {
    await expect(openGuideWindow()).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('openGuideWindow asks Rust to open the window inside Tauri', async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValue(undefined);

    await openGuideWindow();

    expect(invoke).toHaveBeenCalledWith('open_guide_window');
  });

  it('openGuideWindow passes a failure on to the caller', async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockRejectedValue('no window');

    await expect(openGuideWindow()).rejects.toBe('no window');
  });

  it('emitGuideReady does nothing outside Tauri, and emits only once inside it', () => {
    emitGuideReady();
    expect(emit).not.toHaveBeenCalled();

    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    emitGuideReady();
    emitGuideReady();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('guide-ready');
  });
});
