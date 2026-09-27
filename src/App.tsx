import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Toolbar } from './components/Toolbar/Toolbar';
import { Preview } from './components/Preview/Preview';
import { SourceEditor } from './components/Editor/SourceEditor';
import { Outline } from './components/Outline/Outline';
import { SplitView } from './components/Split/SplitView';
import { ConfirmDialog, useDialogStore } from './components/Dialog/ConfirmDialog';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { FindBar } from './components/Find/FindBar';
import { StyleInjector } from './components/Preview/StyleInjector';
import { useAppTheme } from './lib/useAppTheme';
import { useShortcuts } from './lib/shortcuts';
import {
  basename,
  dirname,
  emitAppReady,
  getLaunchArgs,
  isTauri,
  takePendingOpens,
  type FileChangedEvent,
} from './lib/tauri';
import { cycleIndex, samePath, shortDir } from './lib/tabs';
import { useSettingsStore } from './store/settings';
import { isDirty, useDocumentStore } from './store/document';
import {
  hasUnsavedTabs,
  newDocumentPerSetting,
  openPath,
  openPaths,
  routeExternalOpen,
  useTabsStore,
} from './store/tabs';
import { useStyleStore } from './store/style';
import { extractHeadings } from './markdown/render';
import { useViewStore } from './store/view';

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadStyles = useStyleStore((s) => s.load);
  const settingsOpen = useViewStore((s) => s.settingsOpen);
  const setSettingsOpen = useViewStore((s) => s.setSettingsOpen);
  const setFindOpen = useViewStore((s) => s.setFindOpen);
  const set = useSettingsStore((s) => s.set);
  const viewMode = useSettingsStore((s) => s.viewMode);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const previewZoom = useSettingsStore((s) => s.previewZoom);
  const recentFiles = useSettingsStore((s) => s.recentFiles);

  const path = useDocumentStore((s) => s.path);
  const hasDocument = useDocumentStore((s) => s.hasDocument);
  const content = useDocumentStore((s) => s.content);
  const setHeadings = useViewStore((s) => s.setHeadings);
  const dirty = useDocumentStore(isDirty);
  const error = useDocumentStore((s) => s.error);
  const openWithDialog = useDocumentStore((s) => s.openWithDialog);
  const save = useDocumentStore((s) => s.save);
  const externalChange = useDocumentStore((s) => s.externalChange);
  const onFileChanged = useDocumentStore((s) => s.onFileChanged);
  const reload = useDocumentStore((s) => s.reload);
  const dismissExternalChange = useDocumentStore((s) => s.dismissExternalChange);
  const lossy = useDocumentStore((s) => s.lossy);

  const [dragOver, setDragOver] = useState(false);

  useAppTheme();

  // Handle files forwarded by later launches (single-instance plugin).
  const handleOpenRequests = useCallback(async () => {
    if (!useSettingsStore.getState().loaded) return; // startup drains the queue once settings are in
    const paths = await takePendingOpens().catch(() => []);
    if (paths.length === 0) return;
    await useSettingsStore.getState().refresh('openFilesIn');
    for (const p of paths) {
      await routeExternalOpen(p);
    }
  }, []);

  // Startup: load settings, then open a file passed on the command line (file association).
  // Only once everything that affects the first paint's colours is settled do we tell
  // Rust to show the window, so it never flashes the default theme/preset first.
  useEffect(() => {
    void (async () => {
      await Promise.all([loadSettings(), loadStyles()]);
      const arg = await getLaunchArgs();
      if (arg) await openPath(arg);
      await handleOpenRequests();
      requestAnimationFrame(() => requestAnimationFrame(emitAppReady));
    })();
  }, [loadSettings, loadStyles, handleOpenRequests]);

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
          void openPaths(e.payload.paths);
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  // Listen for files forwarded by the single-instance plugin when they arrive after startup.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen('open-requested', () => void handleOpenRequests()).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [handleOpenRequests]);

  // Outline headings come from a cheap headings-only parse so the outline works in every view.
  useEffect(() => {
    const t = setTimeout(() => setHeadings(extractHeadings(content)), 150);
    return () => clearTimeout(t);
  }, [content, setHeadings]);

  // Live reload: the Rust watcher reports external edits to open files. Route each event
  // to the active document or an inactive tab, depending on which one owns the path.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void listen<FileChangedEvent>('file-changed', (e) => {
      if (samePath(e.payload.path, useDocumentStore.getState().path ?? '')) {
        void onFileChanged(e.payload);
      } else {
        useTabsStore.getState().onInactiveFileChanged(e.payload);
      }
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [onFileChanged]);

  // Close guard: ask about unsaved changes before the window closes.
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win
      .onCloseRequested(async (e) => {
        if (!hasUnsavedTabs()) return;
        e.preventDefault();
        if (await useTabsStore.getState().confirmCloseAll()) await win.destroy();
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  // Refresh settings and presets on window focus, in case another window changed them.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          void useSettingsStore
            .getState()
            .refreshAll()
            .catch(() => undefined);
          void useStyleStore
            .getState()
            .refresh()
            .catch(() => undefined);
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  // New note: blank document straight into Source mode so typing can start immediately.
  const createNew = useCallback(async () => {
    await newDocumentPerSetting();
  }, []);

  const zoomIn = useCallback(
    () => set('previewZoom', Math.min(3, +(previewZoom + 0.1).toFixed(2))),
    [set, previewZoom],
  );
  const zoomOut = useCallback(
    () => set('previewZoom', Math.max(0.5, +(previewZoom - 0.1).toFixed(2))),
    [set, previewZoom],
  );
  const zoomReset = useCallback(() => set('previewZoom', 1), [set]);

  const dialogOpen = useDialogStore((s) => s.current !== null);

  const shortcuts = useMemo(
    () => ({
      'ctrl+o': () => void openWithDialog(),
      'ctrl+n': () => void createNew(),
      'ctrl+s': () => void save(),
      'ctrl+shift+s': () => void useDocumentStore.getState().saveAs(),
      'ctrl+e': () => set('viewMode', viewMode === 'source' ? 'formatted' : 'source'),
      'ctrl+shift+e': () => set('viewMode', viewMode === 'split' ? 'formatted' : 'split'),
      'ctrl+\\': () => set('outlineVisible', !outlineVisible),
      'ctrl+=': zoomIn,
      'ctrl++': zoomIn, // numpad plus (no shift)
      'ctrl+shift++': zoomIn, // Shift+= on most US layouts
      'ctrl+shift+=': zoomIn, // browsers that don't shift e.key for Shift+=
      'ctrl+-': zoomOut, // also matches the numpad minus
      'ctrl+0': zoomReset,
      'ctrl+,': () => setSettingsOpen(!settingsOpen),
      'ctrl+f': () => setFindOpen(true),
      'ctrl+t': () => {
        const settings = useSettingsStore.getState();
        if (settings.openFilesIn !== 'tab') return;
        void useTabsStore.getState().newTab();
      },
      'ctrl+w': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs) return;
        void useTabsStore.getState().close(useTabsStore.getState().activeId);
      },
      'ctrl+tab': () => {
        const tabs = useTabsStore.getState().tabs;
        const activeId = useTabsStore.getState().activeId;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs) return;
        const nextIdx = cycleIndex(
          tabs.length,
          tabs.findIndex((t) => t.id === activeId),
          1,
        );
        void useTabsStore.getState().activate(tabs[nextIdx].id);
      },
      'ctrl+pagedown': () => {
        const tabs = useTabsStore.getState().tabs;
        const activeId = useTabsStore.getState().activeId;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs) return;
        const nextIdx = cycleIndex(
          tabs.length,
          tabs.findIndex((t) => t.id === activeId),
          1,
        );
        void useTabsStore.getState().activate(tabs[nextIdx].id);
      },
      'ctrl+shift+tab': () => {
        const tabs = useTabsStore.getState().tabs;
        const activeId = useTabsStore.getState().activeId;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs) return;
        const nextIdx = cycleIndex(
          tabs.length,
          tabs.findIndex((t) => t.id === activeId),
          -1,
        );
        void useTabsStore.getState().activate(tabs[nextIdx].id);
      },
      'ctrl+pageup': () => {
        const tabs = useTabsStore.getState().tabs;
        const activeId = useTabsStore.getState().activeId;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs) return;
        const nextIdx = cycleIndex(
          tabs.length,
          tabs.findIndex((t) => t.id === activeId),
          -1,
        );
        void useTabsStore.getState().activate(tabs[nextIdx].id);
      },
      'ctrl+1': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 1) return;
        void useTabsStore.getState().activate(tabs[0].id);
      },
      'ctrl+2': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 2) return;
        void useTabsStore.getState().activate(tabs[1].id);
      },
      'ctrl+3': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 3) return;
        void useTabsStore.getState().activate(tabs[2].id);
      },
      'ctrl+4': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 4) return;
        void useTabsStore.getState().activate(tabs[3].id);
      },
      'ctrl+5': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 5) return;
        void useTabsStore.getState().activate(tabs[4].id);
      },
      'ctrl+6': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 6) return;
        void useTabsStore.getState().activate(tabs[5].id);
      },
      'ctrl+7': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 7) return;
        void useTabsStore.getState().activate(tabs[6].id);
      },
      'ctrl+8': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs || tabs.length < 8) return;
        void useTabsStore.getState().activate(tabs[7].id);
      },
      'ctrl+9': () => {
        const tabs = useTabsStore.getState().tabs;
        const openFilesIn = useSettingsStore.getState().openFilesIn;
        const showTabs = openFilesIn === 'tab' || tabs.length > 1;
        if (!showTabs) return;
        void useTabsStore.getState().activate(tabs[tabs.length - 1].id);
      },
    }),
    [
      openWithDialog,
      createNew,
      save,
      set,
      viewMode,
      outlineVisible,
      zoomIn,
      zoomOut,
      zoomReset,
      settingsOpen,
      setSettingsOpen,
    ],
  );
  useShortcuts(shortcuts, !dialogOpen);

  return (
    <div className={`app ${dragOver ? 'is-drag-over' : ''}`}>
      <TitleBar
        fileName={path ? basename(path) : hasDocument ? 'Untitled' : undefined}
        dirty={dirty}
      />
      <Toolbar />
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      {externalChange && (
        <div className="banner banner--warning" role="status">
          <span>
            {externalChange === 'removed'
              ? 'This file was deleted or moved on disk.'
              : 'This file was changed on disk and you have unsaved edits.'}
          </span>
          <span className="banner__actions">
            {externalChange === 'modified' && (
              <button className="banner__btn" onClick={() => void reload()}>
                Reload from disk
              </button>
            )}
            <button className="banner__btn" onClick={dismissExternalChange}>
              Keep mine
            </button>
          </span>
        </div>
      )}
      {lossy && (
        <div className="banner banner--warning" role="status">
          <span>
            This file had bytes that aren't valid text. They were shown as {'�'}; saving will make
            that replacement permanent.
          </span>
        </div>
      )}
      <main className="app__body">
        {hasDocument && outlineVisible && <Outline />}
        <div className="app__content">
          {hasDocument && <FindBar />}
          {!hasDocument ? (
            <div className="empty-state">
              <p>Open a Markdown file to get started.</p>
              <p className="empty-state__hint">
                <button className="link-button" onClick={() => void openWithDialog()}>
                  Ctrl+O
                </button>{' '}
                or drop a file here
              </p>
              <p className="empty-state__hint">
                <button className="link-button" onClick={() => void createNew()}>
                  Ctrl+N
                </button>{' '}
                to start a new note
              </p>
              {recentFiles.length > 0 && (
                <div className="empty-state__recent">
                  <p className="empty-state__recent-title">Recent</p>
                  <ul className="empty-state__recent-list">
                    {recentFiles.map((path) => (
                      <li key={path}>
                        <button
                          className="link-button empty-state__recent-item"
                          title={path}
                          onClick={() => void openPath(path)}
                        >
                          <span className="empty-state__recent-name">{basename(path)}</span>
                          <span className="empty-state__recent-dir">
                            {shortDir(dirname(path), 3)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
