import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadGoogleFont,
  googleFontCatalog,
  listDownloadedFonts,
  readFontFile,
  removeDownloadedFont,
  type CatalogFont,
  type DownloadedFont,
} from '@/lib/tauri';
import { unregisterDownloadedFont } from '@/lib/fontLoader';
import { BUILTIN_PRESETS, useStyleStore, type StylePreset } from '@/store/style';
import {
  registerActivePresetFonts,
  registerFontsAtStartup,
  useFontsStore,
  watchPresetFonts,
} from './fonts';

vi.mock('@/lib/tauri', () => ({
  googleFontCatalog: vi.fn(),
  listDownloadedFonts: vi.fn(),
  downloadGoogleFont: vi.fn(),
  removeDownloadedFont: vi.fn(),
  readFontFile: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: () => Promise.reject(new Error('no store')) }));

class FakeFace {
  constructor(
    public family: string,
    public source: unknown,
    public descriptors: unknown,
  ) {}
  load() {
    return Promise.resolve(this);
  }
}

const CATALOG: CatalogFont[] = [
  {
    id: 'literata',
    family: 'Literata',
    category: 'serif',
    subsets: ['latin'],
    weights: [400],
    styles: ['normal'],
    variable: true,
  },
];

function downloaded(id: string, family: string): DownloadedFont {
  return {
    id,
    family,
    category: 'serif',
    files: [
      { file: 'latin-wght-normal.woff2', weight: '200 900', style: 'normal', unicodeRange: '' },
    ],
  };
}

const LITERATA = downloaded('literata', 'Literata');
const LORA_LIKE = downloaded('amiri', 'Amiri');

function usePreset(bodyFont: string, headingFont = '', monoFont = 'monospace') {
  const base = BUILTIN_PRESETS[0];
  const preset: StylePreset = {
    ...base,
    id: 'test-preset',
    builtin: false,
    typography: { ...base.typography, bodyFont, headingFont, monoFont },
  };
  useStyleStore.setState({ presets: [...BUILTIN_PRESETS, preset], activePresetId: preset.id });
}

describe('fonts store', () => {
  const added = new Set<unknown>();

  beforeEach(() => {
    added.clear();
    vi.mocked(googleFontCatalog).mockReset().mockResolvedValue(CATALOG);
    vi.mocked(listDownloadedFonts).mockReset().mockResolvedValue([LITERATA]);
    vi.mocked(downloadGoogleFont).mockReset();
    vi.mocked(removeDownloadedFont).mockReset().mockResolvedValue(undefined);
    vi.mocked(readFontFile).mockReset().mockResolvedValue(new ArrayBuffer(4));
    useFontsStore.setState({
      catalog: null,
      catalogStatus: 'idle',
      downloaded: [],
      downloadedLoaded: false,
    });
    vi.stubGlobal('FontFace', FakeFace);
    Object.defineProperty(document, 'fonts', {
      value: { add: (f: unknown) => added.add(f), delete: (f: unknown) => added.delete(f) },
      configurable: true,
    });
  });

  afterEach(() => {
    for (const id of ['literata', 'amiri']) unregisterDownloadedFont(id);
    vi.unstubAllGlobals();
    useStyleStore.setState({
      presets: BUILTIN_PRESETS,
      activePresetId: BUILTIN_PRESETS[0].id,
    });
  });

  describe('catalogue', () => {
    it('loads once and keeps the result for the session', async () => {
      await Promise.all([
        useFontsStore.getState().loadCatalog(),
        useFontsStore.getState().loadCatalog(),
      ]);
      await useFontsStore.getState().loadCatalog();
      expect(googleFontCatalog).toHaveBeenCalledTimes(1);
      expect(useFontsStore.getState()).toMatchObject({ catalog: CATALOG, catalogStatus: 'ready' });
    });

    it('goes offline with no catalogue when the request fails, and tries again next time', async () => {
      vi.mocked(googleFontCatalog).mockRejectedValueOnce('no connection');
      await useFontsStore.getState().loadCatalog();
      expect(useFontsStore.getState()).toMatchObject({ catalog: null, catalogStatus: 'offline' });

      await useFontsStore.getState().loadCatalog();
      expect(useFontsStore.getState()).toMatchObject({ catalog: CATALOG, catalogStatus: 'ready' });
    });

    it('reports loading while the request is out', async () => {
      let finish!: (list: CatalogFont[]) => void;
      vi.mocked(googleFontCatalog).mockReturnValue(new Promise((r) => (finish = r)));
      const loading = useFontsStore.getState().loadCatalog();
      expect(useFontsStore.getState().catalogStatus).toBe('loading');
      finish(CATALOG);
      await loading;
      expect(useFontsStore.getState().catalogStatus).toBe('ready');
    });
  });

  describe('downloaded fonts', () => {
    it('reads the list once', async () => {
      await useFontsStore.getState().loadDownloaded();
      await useFontsStore.getState().loadDownloaded();
      expect(listDownloadedFonts).toHaveBeenCalledTimes(1);
      expect(useFontsStore.getState().downloaded).toEqual([LITERATA]);
    });

    it('gives an empty list and tries again later when reading fails', async () => {
      vi.mocked(listDownloadedFonts).mockRejectedValueOnce('boom');
      await expect(useFontsStore.getState().loadDownloaded()).resolves.toEqual([]);
      expect(useFontsStore.getState().downloadedLoaded).toBe(false);
      await expect(useFontsStore.getState().loadDownloaded()).resolves.toEqual([LITERATA]);
    });

    it('downloads, registers and lists a font, reporting progress', async () => {
      vi.mocked(downloadGoogleFont).mockImplementation((_id, onProgress) => {
        onProgress?.({ done: 1, total: 2 });
        return Promise.resolve(LITERATA);
      });
      const seen: unknown[] = [];
      await useFontsStore.getState().download('literata', (p) => seen.push(p));
      expect(seen).toEqual([{ done: 1, total: 2 }]);
      expect(useFontsStore.getState().downloaded).toEqual([LITERATA]);
      expect(added.size).toBe(1);
    });

    it('rejects a failed download and lists nothing', async () => {
      vi.mocked(downloadGoogleFont).mockRejectedValue('offline');
      await expect(useFontsStore.getState().download('literata')).rejects.toBe('offline');
      expect(useFontsStore.getState().downloaded).toEqual([]);
    });

    it('removes a font, takes its faces out of the document and allows a re-download', async () => {
      vi.mocked(downloadGoogleFont).mockResolvedValue(LITERATA);
      await useFontsStore.getState().download('literata');
      expect(added.size).toBe(1);

      await useFontsStore.getState().remove('literata');
      expect(removeDownloadedFont).toHaveBeenCalledWith('literata');
      expect(added.size).toBe(0);
      expect(useFontsStore.getState().downloaded).toEqual([]);

      await useFontsStore.getState().download('literata');
      expect(added.size).toBe(1);
    });

    it('keeps the font listed and registered when removing it fails', async () => {
      vi.mocked(downloadGoogleFont).mockResolvedValue(LITERATA);
      await useFontsStore.getState().download('literata');
      vi.mocked(removeDownloadedFont).mockRejectedValue('in use');
      await expect(useFontsStore.getState().remove('literata')).rejects.toBe('in use');
      expect(useFontsStore.getState().downloaded).toEqual([LITERATA]);
      expect(added.size).toBe(1);
    });

    it('registers every downloaded font on request', async () => {
      vi.mocked(listDownloadedFonts).mockResolvedValue([LITERATA, LORA_LIKE]);
      await useFontsStore.getState().registerAll();
      expect(added.size).toBe(2);
    });
  });

  describe('preset fonts', () => {
    beforeEach(() => {
      vi.mocked(listDownloadedFonts).mockResolvedValue([LITERATA, LORA_LIKE]);
    });

    it('registers only the downloaded fonts the active preset uses', async () => {
      usePreset("'Literata', Georgia, serif");
      await registerActivePresetFonts();
      expect(vi.mocked(readFontFile).mock.calls.map((c) => c[0])).toEqual(['literata']);
      expect(added.size).toBe(1);
    });

    it('registers nothing when the preset uses no downloaded font', async () => {
      await registerActivePresetFonts();
      expect(readFontFile).not.toHaveBeenCalled();
    });

    it('registers again when the preset or one of its fonts changes', async () => {
      const stop = watchPresetFonts();
      usePreset("'Amiri', serif");
      await vi.waitFor(() => expect(added.size).toBe(1));
      expect(vi.mocked(readFontFile).mock.calls.map((c) => c[0])).toEqual(['amiri']);

      usePreset("'Amiri', serif", '', "'Literata', monospace");
      await vi.waitFor(() => expect(added.size).toBe(2));
      stop();
    });

    it('does not fail startup when a font file cannot be read', async () => {
      usePreset("'Literata', serif");
      vi.mocked(readFontFile).mockRejectedValue('gone');
      await expect(registerFontsAtStartup()).resolves.toBeUndefined();
      expect(added.size).toBe(0);
    });

    it('does not fail startup when the list cannot be read', async () => {
      vi.mocked(listDownloadedFonts).mockRejectedValue('boom');
      await expect(registerFontsAtStartup()).resolves.toBeUndefined();
    });

    it('stops waiting after the time limit', async () => {
      usePreset("'Literata', serif");
      vi.mocked(readFontFile).mockReturnValue(new Promise(() => undefined));
      const started = Date.now();
      await registerFontsAtStartup(30);
      expect(Date.now() - started).toBeLessThan(500);
    });
  });
});
