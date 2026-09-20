import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/tauri';
import './TitleBar.css';

interface Props {
  fileName?: string;
  dirty?: boolean;
}

export function TitleBar({ fileName, dirty = false }: Props) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win.onResized(() => void win.isMaximized().then(setMaximized)).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  const title = fileName ?? 'Markdown Viewer';
  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${title}`;
  }, [title, dirty]);

  const win = () => getCurrentWindow();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__title" data-tauri-drag-region>
        {dirty && (
          <span className="titlebar__dirty" aria-label="Unsaved changes">
            •
          </span>
        )}
        <span data-tauri-drag-region>{title}</span>
      </div>
      {isTauri() && (
        <div className="titlebar__controls">
          <button
            className="titlebar__btn"
            onClick={() => void win().minimize()}
            aria-label="Minimize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            className="titlebar__btn"
            onClick={() => void win().toggleMaximize()}
            aria-label={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path
                  d="M2.5 0.5h7v7h-2M0.5 2.5h7v7h-7z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect
                  x="0.5"
                  y="0.5"
                  width="9"
                  height="9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            )}
          </button>
          <button
            className="titlebar__btn titlebar__btn--close"
            onClick={() => void win().close()}
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
}
