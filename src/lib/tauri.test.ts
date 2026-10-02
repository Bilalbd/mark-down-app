import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import {
  downloadGoogleFont,
  emitGuideReady,
  googleFontCatalog,
  listDownloadedFonts,
  openGuideWindow,
  readFontFile,
  removeDownloadedFont,
  readClipboardText,
  settingsFolder,
  spellCheck,
  spellLanguages,
  spellSuggest,
  writeClipboardText,
} from '@/lib/tauri';

vi.mock('@tauri-apps/api/path', () => ({ appDataDir: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(),
  Channel: class {
    onmessage: (message: unknown) => void = () => undefined;
  },
}));
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

describe('Google font wrappers', () => {
  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.mocked(invoke).mockReset();
  });

  it('list calls resolve to empty lists outside Tauri', async () => {
    await expect(googleFontCatalog()).resolves.toEqual([]);
    await expect(googleFontCatalog(true)).resolves.toEqual([]);
    await expect(listDownloadedFonts()).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('download, read and remove reject outside Tauri', async () => {
    await expect(downloadGoogleFont('literata')).rejects.toThrow();
    await expect(readFontFile('literata', 'latin-wght-normal.woff2')).rejects.toThrow();
    await expect(removeDownloadedFont('literata')).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('pass their arguments to the matching Rust commands inside Tauri', async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValue(undefined);

    await googleFontCatalog();
    await googleFontCatalog(true);
    await downloadGoogleFont('literata', () => undefined);
    await listDownloadedFonts();
    await readFontFile('literata', 'latin-wght-normal.woff2');
    await removeDownloadedFont('literata');

    expect(vi.mocked(invoke).mock.calls).toEqual([
      ['google_font_catalog', { refresh: false }],
      ['google_font_catalog', { refresh: true }],
      ['download_google_font', { id: 'literata', onProgress: expect.any(Object) }],
      ['list_downloaded_fonts'],
      ['read_font_file', { id: 'literata', file: 'latin-wght-normal.woff2' }],
      ['remove_downloaded_font', { id: 'literata' }],
    ]);
  });

  it('forwards download progress from the channel to the callback', async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockImplementation((_cmd, args) => {
      const channel = (args as { onProgress: { onmessage: (p: unknown) => void } }).onProgress;
      channel.onmessage({ done: 3, total: 12 });
      return Promise.resolve(undefined);
    });
    const seen: unknown[] = [];
    await downloadGoogleFont('literata', (p) => seen.push(p));
    expect(seen).toEqual([{ done: 3, total: 12 }]);
  });

  it('passes a download failure on to the caller', async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockRejectedValue("Couldn't reach the font server.");

    await expect(downloadGoogleFont('literata')).rejects.toBe("Couldn't reach the font server.");
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
