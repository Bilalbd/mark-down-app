import { useEffect, useMemo, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Preview } from './components/Preview/Preview';
import { SourceEditor } from './components/Editor/SourceEditor';
import { Outline } from './components/Outline/Outline';
import { SplitView } from './components/Split/SplitView';
import { ConfirmDialog } from './components/Dialog/ConfirmDialog';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { StyleInjector } from './components/Preview/StyleInjector';
import { useAppTheme } from './lib/useAppTheme';
import { useShortcuts } from './lib/shortcuts';
import { basename, getLaunchArgs, isTauri } from './lib/tauri';
import { useSettingsStore } from './store/settings';
import { isDirty, useDocumentStore } from './store/document';
import { useStyleStore } from './store/style';
import { useViewStore } from './store/view';

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadStyles = useStyleStore((s) => s.load);
  const settingsOpen = useViewStore((s) => s.settingsOpen);
  const setSettingsOpen = useViewStore((s) => s.setSettingsOpen);
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
  const confirmDiscard = useDocumentStore((s) => s.confirmDiscard);

  const [dragOver, setDragOver] = useState(false);

  useAppTheme();

  // Startup: load settings, then open a file passed on the command line (file association).
  useEffect(() => {
    void (async () => {
      await Promise.all([loadSettings(), loadStyles()]);
      const arg = await getLaunchArgs();
      if (arg) await openFile(arg);
    })();
  }, [loadSettings, loadStyles, openFile]);

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

  // Close guard: ask about unsaved changes before the window closes.
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win
      .onCloseRequested(async (e) => {
        if (!isDirty(useDocumentStore.getState())) return;
        e.preventDefault();
        if (await confirmDiscard()) await win.destroy();
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [confirmDiscard]);

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
      'ctrl+,': () => setSettingsOpen(!settingsOpen),
    }),
    [
      openWithDialog,
      save,
      set,
      viewMode,
      outlineVisible,
      previewZoom,
      settingsOpen,
      setSettingsOpen,
    ],
  );
  useShortcuts(shortcuts);

  const hasDoc = path !== null;

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
        {hasDoc && outlineVisible && <Outline />}
        <div className="app__content">
          {!hasDoc ? (
            <div className="empty-state">
              <p>Open a Markdown file to get started.</p>
              <p className="empty-state__hint">
                <button className="link-button" onClick={() => void openWithDialog()}>
                  Ctrl+O
                </button>{' '}
                or drop a file here
              </p>
            </div>
          ) : viewMode === 'formatted' ? (
            <Preview />
          ) : viewMode === 'source' ? (
            <SourceEditor />
          ) : (
            <SplitView />
          )}
        </div>
        <SettingsPanel />
      </main>
      <StyleInjector />
      <ConfirmDialog />
    </div>
  );
}
