import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/tauri';
import markIcon from '@/assets/markdown-mark.png';
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

  useEffect(() => {
    document.title = fileName ? `${dirty ? '• ' : ''}${fileName} - Markdown` : 'Markdown';
  }, [fileName, dirty]);

  const win = () => getCurrentWindow();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__title" data-tauri-drag-region>
        <span
          className="titlebar__logo"
          style={{ maskImage: `url(${markIcon})`, WebkitMaskImage: `url(${markIcon})` }}
          aria-hidden
          data-tauri-drag-region
        />
        <span className="titlebar__app" data-tauri-drag-region>
          Markdown
        </span>
        {fileName && (
          <>
            <span className="titlebar__sep" data-tauri-drag-region>
              –
            </span>
            {dirty && (
              <span className="titlebar__dirty" aria-label="Unsaved changes">
                •
              </span>
            )}
            <span className="titlebar__file" data-tauri-drag-region>
              {fileName}
            </span>
          </>
        )}
      </div>
      {isTauri() && (
        <div className="titlebar__controls">
          <button
            className="titlebar__btn"
            onClick={() => void win().minimize()}
            aria-label="Minimize"
          >
            <Minus size={14} strokeWidth={1.25} absoluteStrokeWidth />
          </button>
          <button
            className="titlebar__btn"
            onClick={() => void win().toggleMaximize()}
            aria-label={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? (
              <Copy
                size={12}
                strokeWidth={1.25}
                absoluteStrokeWidth
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <Square size={12} strokeWidth={1.25} absoluteStrokeWidth />
            )}
          </button>
          <button
            className="titlebar__btn titlebar__btn--close"
            onClick={() => void win().close()}
            aria-label="Close"
          >
            <X size={15} strokeWidth={1.25} absoluteStrokeWidth />
          </button>
        </div>
      )}
    </header>
  );
}
