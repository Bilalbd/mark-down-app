import { useEffect, useState } from 'react';
import { getAppVersion, revealInExplorer, settingsFolder } from '@/lib/tauri';
import { openGuide } from '@/store/tabs';
import markIcon from '@/assets/markdown-mark.svg';
import { Row, Section } from './controls';

export function AboutPage() {
  const [version, setVersion] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAppVersion().then(setVersion);
    void settingsFolder().then(setFolder);
  }, []);

  const showFolder = () => {
    if (!folder) return;
    setError(null);
    revealInExplorer(folder).catch((e) => setError(`Could not open the folder: ${String(e)}`));
  };

  return (
    <>
      <div className="settings__about">
        <span
          className="settings__about-logo"
          style={{ maskImage: `url("${markIcon}")`, WebkitMaskImage: `url("${markIcon}")` }}
          aria-hidden
        />
        <div className="settings__about-text">
          <h2 className="settings__about-name">Markdown</h2>
          {version && <p className="settings__version">Version {version}</p>}
          <p className="settings__about-licence">Released under CC0 1.0</p>
        </div>
      </div>

      <Section title="Guide">
        <Row label="User guide" hint="Every feature, with a cheat sheet (F1)" asLabel={false}>
          <button type="button" className="settings__btn" onClick={() => void openGuide()}>
            Open the guide
          </button>
        </Row>
      </Section>

      <Section title="Settings folder">
        <p className="settings__path">{folder ?? 'Not available outside the app'}</p>
        <div className="settings__actions">
          <button type="button" className="settings__btn" disabled={!folder} onClick={showFolder}>
            Show in File Explorer
          </button>
        </div>
        {error && <p className="settings__note is-error">{error}</p>}
      </Section>
    </>
  );
}
