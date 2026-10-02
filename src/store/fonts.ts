import { create } from 'zustand';
import { downloadedForStacks } from '@/lib/fonts';
import { registerDownloadedFont, unregisterDownloadedFont } from '@/lib/fontLoader';
import {
  downloadGoogleFont,
  googleFontCatalog,
  listDownloadedFonts,
  removeDownloadedFont,
  type CatalogFont,
  type DownloadedFont,
  type DownloadProgress,
} from '@/lib/tauri';
import { useStyleStore, type StylePreset } from '@/store/style';

/** `offline` means the catalogue couldn't be fetched and there is no cached copy. */
export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'offline';

interface FontsState {
  /** The Google Fonts catalogue, fetched when a picker needs it and kept for the session. */
  catalog: CatalogFont[] | null;
  catalogStatus: CatalogStatus;
  /** The Google fonts downloaded so far (from the manifest). */
  downloaded: DownloadedFont[];
  downloadedLoaded: boolean;

  /** Loads the catalogue once per session; a failed attempt is tried again on the next call. */
  loadCatalog: () => Promise<void>;
  /** Reads the downloaded fonts once; resolves to `[]` if that fails (and tries again next time). */
  loadDownloaded: () => Promise<DownloadedFont[]>;
  /** Registers every downloaded font, so pickers can preview them in their own faces. */
  registerAll: () => Promise<void>;
  /** Downloads a font, registers it and adds it to the list. Rejects with the failure message. */
  download: (id: string, onProgress?: (p: DownloadProgress) => void) => Promise<DownloadedFont>;
  /** Deletes a downloaded font and takes it out of `document.fonts`. */
  remove: (id: string) => Promise<void>;
}

let catalogRequest: Promise<void> | null = null;
let downloadedRequest: Promise<DownloadedFont[]> | null = null;

function byFamily(a: DownloadedFont, b: DownloadedFont): number {
  return a.family.localeCompare(b.family);
}

export const useFontsStore = create<FontsState>((set, get) => ({
  catalog: null,
  catalogStatus: 'idle',
  downloaded: [],
  downloadedLoaded: false,

  loadCatalog: () => {
    if (get().catalog) return Promise.resolve();
    catalogRequest ??= (async () => {
      set({ catalogStatus: 'loading' });
      try {
        set({ catalog: await googleFontCatalog(), catalogStatus: 'ready' });
      } catch {
        // Offline with no cached copy: the picker says so and the next call tries again.
        set({ catalogStatus: 'offline' });
      } finally {
        catalogRequest = null;
      }
    })();
    return catalogRequest;
  },

  loadDownloaded: () => {
    if (get().downloadedLoaded) return Promise.resolve(get().downloaded);
    downloadedRequest ??= listDownloadedFonts()
      .then((list) => {
        set({ downloaded: list, downloadedLoaded: true });
        return list;
      })
      .catch(() => get().downloaded) // unreadable manifest: show what we know, retry next time
      .finally(() => {
        downloadedRequest = null;
      });
    return downloadedRequest;
  },

  registerAll: async () => {
    const list = await get().loadDownloaded();
    await Promise.allSettled(list.map(registerDownloadedFont));
  },

  download: async (id, onProgress) => {
    const font = await downloadGoogleFont(id, onProgress);
    set((s) => ({
      downloaded: [...s.downloaded.filter((f) => f.id !== font.id), font].sort(byFamily),
    }));
    // A re-download replaces the files, so start from a clean registration.
    unregisterDownloadedFont(font.id);
    await registerDownloadedFont(font);
    return font;
  },

  remove: async (id) => {
    await removeDownloadedFont(id);
    unregisterDownloadedFont(id);
    set((s) => ({ downloaded: s.downloaded.filter((f) => f.id !== id) }));
  },
}));

function presetStacks(preset: StylePreset | undefined): string[] {
  if (!preset) return [];
  const t = preset.typography;
  return [t.bodyFont, t.headingFont, t.monoFont];
}

function activeStacks(s: { presets: StylePreset[]; activePresetId: string }): string[] {
  return presetStacks(s.presets.find((p) => p.id === s.activePresetId));
}

/** Registers the downloaded fonts the active preset's three font stacks start with. */
export async function registerActivePresetFonts(): Promise<void> {
  const downloaded = await useFontsStore.getState().loadDownloaded();
  const used = downloadedForStacks(activeStacks(useStyleStore.getState()), downloaded);
  await Promise.allSettled(used.map(registerDownloadedFont));
}

/**
 * Startup: registers the active preset's downloaded fonts, but waits at most `maxMs` and never
 * fails, so a slow or broken font can't hold up showing the window.
 */
export async function registerFontsAtStartup(maxMs = 800): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, maxMs);
  });
  // Failures are ignored here: the preset's fallback fonts show instead.
  const work = registerActivePresetFonts().catch(() => undefined);
  await Promise.race([work, timeout]);
  clearTimeout(timer);
}

/** Registers fonts again whenever the active preset, or any of its three fonts, changes. */
export function watchPresetFonts(): () => void {
  const key = (s: { presets: StylePreset[]; activePresetId: string }) => activeStacks(s).join('|');
  return useStyleStore.subscribe((state, prev) => {
    if (key(state) !== key(prev)) void registerActivePresetFonts().catch(() => undefined);
  });
}
