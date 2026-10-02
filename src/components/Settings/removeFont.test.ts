import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeDownloadedFont } from '@/lib/tauri';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { BUILTIN_PRESETS, useStyleStore, type StylePreset } from '@/store/style';
import { useFontsStore } from '@/store/fonts';
import { removeDownloadedFontConfirmed } from './removeFont';

vi.mock('@/lib/tauri', () => ({
  listDownloadedFonts: vi.fn(),
  removeDownloadedFont: vi.fn(),
  googleFontCatalog: vi.fn(),
  downloadGoogleFont: vi.fn(),
  readFontFile: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: () => Promise.reject(new Error('no store')) }));

const LITERATA = { id: 'literata', family: 'Literata' };

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

describe('removeDownloadedFontConfirmed', () => {
  beforeEach(() => {
    vi.mocked(removeDownloadedFont).mockReset().mockResolvedValue(undefined);
    useFontsStore.setState({ downloaded: [], downloadedLoaded: true });
    useStyleStore.setState({ presets: BUILTIN_PRESETS, activePresetId: BUILTIN_PRESETS[0].id });
  });

  afterEach(() => {
    useDialogStore.setState({ current: null });
  });

  it('removes a font the active preset does not use, without asking', async () => {
    const onRemoving = vi.fn();
    expect(await removeDownloadedFontConfirmed(LITERATA, onRemoving)).toBe(true);
    expect(useDialogStore.getState().current).toBeNull();
    expect(onRemoving).toHaveBeenCalledTimes(1);
    expect(removeDownloadedFont).toHaveBeenCalledWith('literata');
  });

  it('asks when any of the preset body, heading or code fonts uses the font', async () => {
    usePresetWith("'Literata', Georgia, serif");
    const done = removeDownloadedFontConfirmed(LITERATA);
    const dialog = useDialogStore.getState().current!;
    expect(dialog.title).toBe('Remove Literata?');
    expect(dialog.message).toContain('"Mine" preset uses this font');
    expect(removeDownloadedFont).not.toHaveBeenCalled();
    useDialogStore.getState().close('remove');
    expect(await done).toBe(true);
    expect(removeDownloadedFont).toHaveBeenCalledWith('literata');
  });

  it('removes nothing and does not call onRemoving when the user cancels', async () => {
    usePresetWith("'Literata', Georgia, serif");
    const onRemoving = vi.fn();
    const done = removeDownloadedFontConfirmed(LITERATA, onRemoving);
    useDialogStore.getState().close('cancel');
    expect(await done).toBe(false);
    expect(onRemoving).not.toHaveBeenCalled();
    expect(removeDownloadedFont).not.toHaveBeenCalled();
  });

  it('treats a dismissed dialog as Cancel', async () => {
    usePresetWith("'Literata', Georgia, serif");
    const done = removeDownloadedFontConfirmed(LITERATA);
    useDialogStore.getState().close(null);
    expect(await done).toBe(false);
    expect(removeDownloadedFont).not.toHaveBeenCalled();
  });

  it('rejects with the failure when the removal fails', async () => {
    vi.mocked(removeDownloadedFont).mockRejectedValue('Access is denied.');
    await expect(removeDownloadedFontConfirmed(LITERATA)).rejects.toBe('Access is denied.');
  });
});
