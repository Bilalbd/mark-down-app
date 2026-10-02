import { useEffect, useState } from 'react';
import type { DownloadedFont } from '@/lib/tauri';
import { useFontsStore } from '@/store/fonts';
import { Section } from './controls';
import { removeDownloadedFontConfirmed } from './removeFont';
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
    try {
      await removeDownloadedFontConfirmed(font, () => {
        setBusy(font.id);
        setError(null);
      });
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
