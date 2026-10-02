import { useEffect, useState } from 'react';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { stacksUseFamily } from '@/lib/fonts';
import type { DownloadedFont } from '@/lib/tauri';
import { useFontsStore } from '@/store/fonts';
import { useStyleStore } from '@/store/style';
import { Section } from './controls';
import './DownloadedFonts.css';

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  return e instanceof Error ? e.message : String(e);
}

/** Settings → Appearance: the Google fonts that have been downloaded, each with a Remove button. */
export function DownloadedFonts() {
  const downloaded = useFontsStore((s) => s.downloaded);
  const loaded = useFontsStore((s) => s.downloadedLoaded);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useFontsStore.getState().loadDownloaded();
  }, []);

  const remove = async (font: DownloadedFont) => {
    const preset = useStyleStore.getState().active();
    const t = preset.typography;
    // The preset keeps its font stack, so the text falls back until a new font is chosen.
    if (stacksUseFamily([t.bodyFont, t.headingFont, t.monoFont], font.family)) {
      const choice = await useDialogStore
        .getState()
        .show(
          `Remove ${font.family}?`,
          `The "${preset.name}" preset uses this font. It will fall back to another font until you choose a new one.`,
          [
            { id: 'remove', label: 'Remove', danger: true },
            { id: 'cancel', label: 'Cancel', primary: true },
          ],
        );
      if (choice !== 'remove') return;
    }
    setBusy(font.id);
    setError(null);
    try {
      await useFontsStore.getState().remove(font.id);
    } catch (e) {
      setError(`Could not remove ${font.family}: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Downloaded fonts">
      {downloaded.length === 0 ? (
        loaded && (
          <p className="settings__note">
            No Google fonts downloaded yet. Pick one from the Google Fonts group in a font list
            above.
          </p>
        )
      ) : (
        <ul className="downloaded-fonts">
          {downloaded.map((font) => (
            <li key={font.id} className="downloaded-fonts__item">
              <span className="downloaded-fonts__name">{font.family}</span>
              <button
                type="button"
                className="settings__btn"
                disabled={busy === font.id}
                aria-label={`Remove ${font.family}`}
                onClick={() => void remove(font)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="settings__note is-error" role="alert">
          {error}
        </p>
      )}
    </Section>
  );
}
