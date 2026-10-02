import { readFontFile, type DownloadedFont, type DownloadedFontFile } from '@/lib/tauri';

interface Registration {
  /** Set when the font is removed while its files are still loading, so none are added late. */
  cancelled: boolean;
  faces: FontFace[];
  done: Promise<void>;
}

const registrations = new Map<string, Registration>();

async function loadFace(font: DownloadedFont, file: DownloadedFontFile): Promise<FontFace> {
  const bytes = await readFontFile(font.id, file.file);
  const face = new FontFace(font.family, bytes, {
    weight: file.weight,
    style: file.style,
    ...(file.unicodeRange ? { unicodeRange: file.unicodeRange } : {}),
  });
  await face.load();
  return face;
}

/**
 * Makes a downloaded Google font usable in CSS by adding its files to `document.fonts` as
 * `FontFace` objects (the CSP only allows fonts from the app itself, so the bytes come from Rust).
 * Once per font per session; a file that fails to load is skipped, and the promise rejects only if
 * none of them loaded (a later call then tries again).
 */
export function registerDownloadedFont(font: DownloadedFont): Promise<void> {
  const existing = registrations.get(font.id);
  if (existing) return existing.done;
  const entry: Registration = { cancelled: false, faces: [], done: Promise.resolve() };
  entry.done = Promise.allSettled(
    font.files.map(async (file) => {
      const face = await loadFace(font, file);
      if (!entry.cancelled) {
        document.fonts.add(face);
        entry.faces.push(face);
      }
    }),
  ).then((results) => {
    if (entry.cancelled) return;
    const failed = results.find((r) => r.status === 'rejected');
    if (failed && entry.faces.length === 0) {
      registrations.delete(font.id);
      throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
    }
  });
  registrations.set(font.id, entry);
  return entry.done;
}

/**
 * Takes a font's `FontFace` objects out of `document.fonts`, so text falls back at once, and
 * forgets it was registered, so registering it again later (after a re-download) works.
 */
export function unregisterDownloadedFont(id: string): void {
  const entry = registrations.get(id);
  if (!entry) return;
  entry.cancelled = true;
  for (const face of entry.faces) document.fonts.delete(face);
  registrations.delete(id);
}
