import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { listDownloadedFonts, removeDownloadedFont, type DownloadedFont } from '@/lib/tauri';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { BUILTIN_PRESETS, useStyleStore, type StylePreset } from '@/store/style';
import { useFontsStore } from '@/store/fonts';
import { DownloadedFonts } from './DownloadedFonts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@/lib/tauri', () => ({
  listDownloadedFonts: vi.fn(),
  removeDownloadedFont: vi.fn(),
  googleFontCatalog: vi.fn(),
  downloadGoogleFont: vi.fn(),
  readFontFile: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: () => Promise.reject(new Error('no store')) }));

function font(id: string, family: string): DownloadedFont {
  return { id, family, category: 'serif', files: [] };
}
const LITERATA = font('literata', 'Literata');
const AMIRI = font('amiri', 'Amiri');

describe('DownloadedFonts', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  async function mount(list: DownloadedFont[]) {
    vi.mocked(listDownloadedFonts).mockResolvedValue(list);
    await act(async () => root.render(<DownloadedFonts />));
  }

  const names = () =>
    Array.from(container.querySelectorAll('.downloaded-fonts__name')).map((n) => n.textContent);
  const removeButton = (family: string) =>
    container.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${family}"]`)!;
  /** Answers the confirmation dialog the way the user would. */
  const answer = async (id: string | null) => {
    await vi.waitFor(() => expect(useDialogStore.getState().current).not.toBeNull());
    await act(async () => useDialogStore.getState().close(id));
  };

  beforeEach(() => {
    vi.mocked(removeDownloadedFont).mockReset().mockResolvedValue(undefined);
    useFontsStore.setState({ downloaded: [], downloadedLoaded: false });
    useStyleStore.setState({ presets: BUILTIN_PRESETS, activePresetId: BUILTIN_PRESETS[0].id });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    useDialogStore.setState({ current: null });
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  function usePresetWith(bodyFont: string) {
    const base = BUILTIN_PRESETS[0];
    const preset: StylePreset = {
      ...base,
      id: 'mine',
      name: 'Mine',
      builtin: false,
      typography: { ...base.typography, bodyFont },
    };
    useStyleStore.setState({ presets: [...BUILTIN_PRESETS, preset], activePresetId: 'mine' });
  }

  it('lists the downloaded fonts, each with a Remove button', async () => {
    await mount([AMIRI, LITERATA]);
    expect(container.querySelector('h3')?.textContent).toBe('Downloaded fonts');
    expect(names()).toEqual(['Amiri', 'Literata']);
    expect(removeButton('Amiri').textContent).toBe('Remove');
  });

  it('says so when no Google font has been downloaded', async () => {
    await mount([]);
    expect(names()).toEqual([]);
    expect(container.textContent).toContain('No Google fonts downloaded yet.');
  });

  it('removes a font that the active preset does not use without asking', async () => {
    await mount([AMIRI, LITERATA]);
    await act(async () => removeButton('Amiri').click());
    expect(useDialogStore.getState().current).toBeNull();
    expect(removeDownloadedFont).toHaveBeenCalledWith('amiri');
    expect(names()).toEqual(['Literata']);
  });

  it('asks first when the active preset uses the font, and keeps it on Cancel', async () => {
    usePresetWith("'Literata', Georgia, serif");
    await mount([LITERATA]);
    await act(async () => removeButton('Literata').click());
    const dialog = useDialogStore.getState().current!;
    expect(dialog.title).toBe('Remove Literata?');
    expect(dialog.message).toContain('"Mine" preset uses this font');
    await answer('cancel');
    expect(removeDownloadedFont).not.toHaveBeenCalled();
    expect(names()).toEqual(['Literata']);
  });

  it('removes it after confirming, leaving the preset as it was', async () => {
    usePresetWith("'Literata', Georgia, serif");
    await mount([LITERATA]);
    await act(async () => removeButton('Literata').click());
    await answer('remove');
    await vi.waitFor(() => expect(names()).toEqual([]));
    expect(removeDownloadedFont).toHaveBeenCalledWith('literata');
    expect(useStyleStore.getState().active().typography.bodyFont).toBe(
      "'Literata', Georgia, serif",
    );
  });

  it('shows why a removal failed and keeps the font listed', async () => {
    vi.mocked(removeDownloadedFont).mockRejectedValue('Access is denied.');
    await mount([AMIRI]);
    await act(async () => removeButton('Amiri').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not remove Amiri: Access is denied.',
    );
    expect(names()).toEqual(['Amiri']);
  });
});
