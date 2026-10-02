import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import {
  BUILTIN_FONTS,
  catalogToFamilies,
  downloadedToFamilies,
  excludeBuiltin,
  isGenericFamily,
  missingGoogleFonts,
  primaryFamily,
  resolveFamily,
  systemFontsToFamilies,
  type FontFamily,
} from '@/lib/fonts';
import { listSystemFonts } from '@/lib/tauri';
import { useFontsStore } from '@/store/fonts';

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  return e instanceof Error ? e.message : String(e);
}

/**
 * After a preset is imported: if its fonts can only come from the Google Fonts catalogue, asks once
 * whether to download them all. `onStatus` hears about progress. Resolves to a sentence for the
 * Presets tab, or null if nothing was asked (nothing missing, or offline, which is skipped silently).
 */
export async function offerGoogleFonts(
  stacks: string[],
  onStatus: (text: string) => void,
): Promise<string | null> {
  const store = useFontsStore.getState();
  const downloaded = downloadedToFamilies(await store.loadDownloaded());
  const system = excludeBuiltin(systemFontsToFamilies(await listSystemFonts()));
  const local = { builtin: BUILTIN_FONTS, downloaded, system };
  // Only fetch the catalogue if some font isn't provided locally.
  const provided = (stack: string) => {
    const name = primaryFamily(stack);
    return name === null || isGenericFamily(name) || resolveFamily(stack, local) !== null;
  };
  if (stacks.every(provided)) return null;

  await store.loadCatalog();
  const { catalog } = useFontsStore.getState();
  if (!catalog) return null;
  const missing: FontFamily[] = missingGoogleFonts(stacks, {
    ...local,
    google: catalogToFamilies(catalog),
  });
  if (missing.length === 0) return null;

  const names = joinNames(missing.map((f) => f.family));
  const choice = await useDialogStore
    .getState()
    .show(
      `Download ${names}?`,
      `This preset uses ${missing.length === 1 ? 'a font' : 'fonts'} that ${
        missing.length === 1 ? "isn't" : "aren't"
      } on this PC. Markdown can download ${
        missing.length === 1 ? 'it' : 'them'
      } once from Fontsource, and ${missing.length === 1 ? 'it' : 'they'} will then work offline.`,
      [
        { id: 'download', label: 'Download', primary: true },
        { id: 'later', label: 'Not now' },
      ],
    );
  if (choice !== 'download') return null;

  for (const font of missing) {
    const id = font.googleId;
    if (!id) continue;
    onStatus(`Downloading ${font.family}…`);
    try {
      await useFontsStore.getState().download(id, (p) => {
        onStatus(`Downloading ${font.family}… ${p.done}/${p.total}`);
      });
    } catch (e) {
      return `Could not download ${font.family}: ${errorMessage(e)}`;
    }
  }
  return `Downloaded ${names}.`;
}
