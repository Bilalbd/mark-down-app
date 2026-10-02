import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadGoogleFont,
  googleFontCatalog,
  listDownloadedFonts,
  listSystemFonts,
  type CatalogFont,
  type DownloadedFont,
} from '@/lib/tauri';
import { unregisterDownloadedFont } from '@/lib/fontLoader';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { useFontsStore } from '@/store/fonts';
import { joinNames, offerGoogleFonts } from './importFonts';

vi.mock('@/lib/tauri', () => ({
  listSystemFonts: vi.fn(),
  googleFontCatalog: vi.fn(),
  listDownloadedFonts: vi.fn(),
  downloadGoogleFont: vi.fn(),
  removeDownloadedFont: vi.fn(),
  readFontFile: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: () => Promise.reject(new Error('no store')) }));

class FakeFace {
  load() {
    return Promise.resolve(this);
  }
}

function catalogFont(id: string, family: string): CatalogFont {
  return {
    id,
    family,
    category: 'serif',
    subsets: ['latin'],
    weights: [400],
    styles: ['normal'],
    variable: false,
  };
}

const CATALOG = [
  catalogFont('literata', 'Literata'),
  catalogFont('lora', 'Lora'),
  catalogFont('amiri', 'Amiri'),
];

function downloaded(id: string, family: string): DownloadedFont {
  return { id, family, category: 'serif', files: [] };
}

describe('joinNames', () => {
  it('reads like a sentence', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Literata'])).toBe('Literata');
    expect(joinNames(['Literata', 'Amiri'])).toBe('Literata and Amiri');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('offerGoogleFonts', () => {
  const status = vi.fn<(text: string) => void>();
  /** Answers the dialog as soon as it appears. */
  const respond = (id: string | null) => {
    const unsubscribe = useDialogStore.subscribe((s) => {
      if (s.current) {
        unsubscribe();
        useDialogStore.getState().close(id);
      }
    });
  };

  beforeEach(() => {
    status.mockReset();
    vi.mocked(listSystemFonts).mockReset().mockResolvedValue([]);
    vi.mocked(googleFontCatalog).mockReset().mockResolvedValue(CATALOG);
    vi.mocked(listDownloadedFonts).mockReset().mockResolvedValue([]);
    vi.mocked(downloadGoogleFont)
      .mockReset()
      .mockImplementation((id) => Promise.resolve(downloaded(id, id)));
    useFontsStore.setState({
      catalog: null,
      catalogStatus: 'idle',
      downloaded: [],
      downloadedLoaded: false,
    });
    useDialogStore.setState({ current: null });
    vi.stubGlobal('FontFace', FakeFace);
    Object.defineProperty(document, 'fonts', {
      value: { add: vi.fn(), delete: vi.fn() },
      configurable: true,
    });
    for (const id of ['literata', 'amiri']) unregisterDownloadedFont(id);
  });

  it('asks once for every family only the catalogue provides, then downloads them in turn', async () => {
    const asked: string[] = [];
    const unsubscribe = useDialogStore.subscribe((s) => {
      if (!s.current) return;
      unsubscribe();
      asked.push(s.current.title, s.current.buttons.map((b) => b.label).join('/'));
      useDialogStore.getState().close('download');
    });
    vi.mocked(downloadGoogleFont).mockImplementation((id, onProgress) => {
      onProgress?.({ done: 1, total: 4 });
      return Promise.resolve(downloaded(id, id));
    });
    const result = await offerGoogleFonts(
      ["'Literata', serif", '', "'Amiri', serif", "'Inter Variable'"],
      status,
    );
    expect(asked).toEqual(['Download Literata and Amiri?', 'Download/Not now']);
    expect(vi.mocked(downloadGoogleFont).mock.calls.map((c) => c[0])).toEqual([
      'literata',
      'amiri',
    ]);
    expect(status).toHaveBeenCalledWith('Downloading Literata… 1/4');
    expect(result).toBe('Downloaded Literata and Amiri.');
    expect(useFontsStore.getState().downloaded.map((f) => f.id)).toEqual(['amiri', 'literata']);
  });

  it('downloads nothing on Not now', async () => {
    respond('later');
    const result = await offerGoogleFonts(["'Literata', serif"], status);
    expect(result).toBeNull();
    expect(downloadGoogleFont).not.toHaveBeenCalled();
  });

  it('does not ask, or fetch the catalogue, when the fonts are built in or generic', async () => {
    const result = await offerGoogleFonts(
      ["'Inter Variable', sans-serif", '', 'monospace'],
      status,
    );
    expect(result).toBeNull();
    expect(googleFontCatalog).not.toHaveBeenCalled();
    expect(useDialogStore.getState().current).toBeNull();
  });

  it('does not ask about fonts that are already downloaded or installed', async () => {
    vi.mocked(listDownloadedFonts).mockResolvedValue([downloaded('literata', 'Literata')]);
    vi.mocked(listSystemFonts).mockResolvedValue([
      { family: 'Amiri', monospace: false, arabic: true },
    ]);
    const result = await offerGoogleFonts(["'Literata', serif", 'Amiri'], status);
    expect(result).toBeNull();
    expect(useDialogStore.getState().current).toBeNull();
  });

  it('does not ask about fonts the catalogue does not have', async () => {
    const result = await offerGoogleFonts(['Charter, Georgia, serif'], status);
    expect(result).toBeNull();
    expect(useDialogStore.getState().current).toBeNull();
  });

  it('skips the prompt silently when the catalogue cannot be loaded', async () => {
    vi.mocked(googleFontCatalog).mockRejectedValue('offline');
    const result = await offerGoogleFonts(["'Literata', serif"], status);
    expect(result).toBeNull();
    expect(useDialogStore.getState().current).toBeNull();
  });

  it('reports a failed download and stops', async () => {
    respond('download');
    vi.mocked(downloadGoogleFont).mockRejectedValue("Couldn't reach the font server.");
    const result = await offerGoogleFonts(["'Literata', serif", "'Amiri', serif"], status);
    expect(result).toBe("Could not download Literata: Couldn't reach the font server.");
    expect(downloadGoogleFont).toHaveBeenCalledTimes(1);
  });
});
