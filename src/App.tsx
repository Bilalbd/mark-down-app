import { useEffect, useMemo, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Preview } from './components/Preview/Preview';
import { useAppTheme } from './lib/useAppTheme';
import { useShortcuts } from './lib/shortcuts';
import { basename, getLaunchArgs, isTauri } from './lib/tauri';
import { useSettingsStore } from './store/settings';
import { isDirty, useDocumentStore } from './store/document';

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const set = useSettingsStore((s) => s.set);
  const viewMode = useSettingsStore((s) => s.viewMode);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const previewZoom = useSettingsStore((s) => s.previewZoom);

  const path = useDocumentStore((s) => s.path);
  const dirty = useDocumentStore(isDirty);
  const error = useDocumentStore((s) => s.error);
  const openFile = useDocumentStore((s) => s.open);
  const openWithDialog = useDocumentStore((s) => s.openWithDialog);
  const save = useDocumentStore((s) => s.save);

  const [dragOver, setDragOver] = useState(false);

  useAppTheme();

  // Startup: load settings, then open a file passed on the command line (file association).
  useEffect(() => {
    void (async () => {
      await loadSettings();
      const arg = await getLaunchArgs();
      if (arg) await openFile(arg);
    })();
  }, [loadSettings, openFile]);

  // Drag & drop from Explorer (Tauri-native event; browser DnD is disabled by dragDropEnabled).
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type === 'enter' || e.payload.type === 'over') setDragOver(true);
        else if (e.payload.type === 'leave') setDragOver(false);
        else if (e.payload.type === 'drop') {
          setDragOver(false);
          const first = e.payload.paths[0];
          if (first) void openFile(first);
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [openFile]);

  const shortcuts = useMemo(
    () => ({
      'ctrl+o': () => void openWithDialog(),
      'ctrl+s': () => void save(),
      'ctrl+e': () => set('viewMode', viewMode === 'source' ? 'formatted' : 'source'),
      'ctrl+shift+e': () => set('viewMode', viewMode === 'split' ? 'formatted' : 'split'),
      'ctrl+\\': () => set('outlineVisible', !outlineVisible),
      'ctrl+=': () => set('previewZoom', Math.min(3, +(previewZoom + 0.1).toFixed(2))),
      'ctrl+-': () => set('previewZoom', Math.max(0.5, +(previewZoom - 0.1).toFixed(2))),
      'ctrl+0': () => set('previewZoom', 1),
    }),
    [openWithDialog, save, set, viewMode, outlineVisible, previewZoom],
  );
  useShortcuts(shortcuts);

  return (
    <div className={`app ${dragOver ? 'is-drag-over' : ''}`}>
      <TitleBar fileName={path ? basename(path) : undefined} dirty={dirty} />
      <Toolbar />
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      <main className="app__body">
        <div className="app__content">
          {path === null ? (
            <div className="empty-state">
              <p>Open a Markdown file to get started.</p>
              <p className="empty-state__hint">
                <button className="link-button" onClick={() => void openWithDialog()}>
                  Ctrl+O
                </button>{' '}
                or drop a file here
              </p>
            </div>
          ) : (
            <Preview />
          )}
        </div>
      </main>
    </div>
  );
}
