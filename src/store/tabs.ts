import { create } from 'zustand';
import {
  DocFields,
  EMPTY_DOC,
  isDirty,
  nextLoadId,
  pickDocFields,
  setOpenHandler,
  setSaveTargetGuard,
  useDocumentStore,
} from '@/store/document';
import { useSettingsStore, type ViewMode } from '@/store/settings';
import { useViewStore } from '@/store/view';
import {
  basename,
  dirname,
  isTauri,
  openInNewWindow,
  setAssetRoot,
  unwatchFile,
  type FileChangedEvent,
} from '@/lib/tauri';
import { pruneEditorCache } from '@/lib/editorCache';
import {
  cycleIndex,
  findTabByPath,
  isBlankDocument,
  moveItem,
  nextActiveAfterClose,
  samePath,
  tabsVisible,
} from '@/lib/tabs';

export interface TabSnapshot {
  doc: DocFields;
  viewMode: ViewMode;
  topLine: number;
  /** The file changed on disk while this tab was inactive and clean; reload on activation. */
  needsReload: boolean;
}

export interface Tab {
  id: string;
  /** null while this tab is the active one (its live state is in the document store). */
  snapshot: TabSnapshot | null;
}

interface TabsState {
  tabs: Tab[];
  activeId: string;
  /** Opens `path` in a new tab, or focuses it if already open, or loads it into a blank active tab. */
  openInTab: (path: string) => Promise<boolean>;
  /** Creates a new blank tab, or a new unsaved document if showing the start screen. */
  newTab: () => Promise<void>;
  /** Activates a tab by id, capturing and swapping its state. */
  activate: (id: string) => Promise<void>;
  /** Closes a tab by id, asking about unsaved changes if dirty. Returns false if cancelled. */
  close: (id: string) => Promise<boolean>;
  /** Closes all other tabs except the one with the given id. Stops and returns false if any prompt is cancelled. */
  closeOthers: (id: string) => Promise<boolean>;
  /** Closes all tabs to the right of the one with the given id. Stops and returns false if any prompt is cancelled. */
  closeToRight: (id: string) => Promise<boolean>;
  /** Iterates through all tabs, asking about each dirty one; returns false if any cancelled. Does not remove tabs. */
  confirmCloseAll: () => Promise<boolean>;
  /** Reorders tabs by moving the one at `from` to position `to`. */
  move: (from: number, to: number) => void;
  /** Updates an inactive tab's snapshot when its file changes on disk. */
  onInactiveFileChanged: (e: FileChangedEvent) => void;
}

let tabCounter = 0;

function newTabId(): string {
  return `tab-${++tabCounter}`;
}

/** The snapshot's doc.path, or for the active tab useDocumentStore.getState().path. */
function pathOf(tab: Tab): string | null {
  if (tab.snapshot === null) {
    return useDocumentStore.getState().path;
  }
  return tab.snapshot.doc.path;
}

/** Captures the active tab's state into a snapshot. */
function captureActive(): TabSnapshot {
  return {
    doc: pickDocFields(useDocumentStore.getState()),
    viewMode: useSettingsStore.getState().viewMode,
    topLine: useViewStore.getState().topLine,
    needsReload: false,
  };
}

/** Asynchronously applies the asset root for a path (must happen before swapIn to avoid edit window). */
async function applyAssetRoot(path: string | null): Promise<void> {
  if (isTauri()) {
    await setAssetRoot(path ? dirname(path) : null).catch(() => undefined);
  }
}

/** Synchronously swaps a snapshot into the live document and UI stores (no awaits). */
function swapIn(snap: TabSnapshot): void {
  useViewStore.getState().setFindOpen(false);
  useViewStore.getState().setTopLine(snap.topLine);
  useDocumentStore.setState(snap.doc);
  useSettingsStore.getState().set('viewMode', snap.viewMode);
  if (snap.topLine > 0) {
    useViewStore.getState().requestScrollToLine(snap.topLine);
  }
}

/** Immutably update one tab's snapshot. */
function updateSnapshot(tabs: Tab[], tabId: string, fn: (snap: TabSnapshot) => TabSnapshot): Tab[] {
  return tabs.map((t) =>
    t.id === tabId && t.snapshot ? { id: t.id, snapshot: fn(t.snapshot) } : t,
  );
}

/** Returns the active document's loadId plus every snapshot's loadId (all live load IDs). */
function liveLoadIds(): number[] {
  const state = useTabsStore.getState();
  const activeLoadId = useDocumentStore.getState().loadId;
  const ids = [activeLoadId];

  for (const tab of state.tabs) {
    if (tab.snapshot && tab.snapshot.doc.loadId !== activeLoadId) {
      ids.push(tab.snapshot.doc.loadId);
    }
  }

  return ids;
}

const firstTabId = newTabId();

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [{ id: firstTabId, snapshot: null }],
  activeId: firstTabId,

  activate: async (id) => {
    const state = get();
    if (id === state.activeId) return;
    const incomingTab = state.tabs.find((t) => t.id === id);
    if (!incomingTab || incomingTab.snapshot === null) return;

    await applyAssetRoot(incomingTab.snapshot.doc.path);

    const currentState = get();
    const currentIncomingTab = currentState.tabs.find((t) => t.id === id);
    if (!currentIncomingTab || currentIncomingTab.snapshot === null) return;

    const outgoing = captureActive();
    const activeIdx = currentState.tabs.findIndex((t) => t.id === currentState.activeId);
    const incomingIdx = currentState.tabs.findIndex((t) => t.id === id);

    set({
      tabs: currentState.tabs.map((t, i) => {
        if (i === activeIdx) return { ...t, snapshot: outgoing };
        if (i === incomingIdx) return { ...t, snapshot: null };
        return t;
      }),
      activeId: id,
    });

    swapIn(currentIncomingTab.snapshot);

    if (currentIncomingTab.snapshot.needsReload && !isDirty(currentIncomingTab.snapshot.doc)) {
      await useDocumentStore.getState().reload();
    }

    pruneEditorCache(liveLoadIds());
  },

  openInTab: async (path) => {
    // Check if already open
    const existingId = findTabByPath(
      get().tabs.map((t) => ({ id: t.id, path: pathOf(t) })),
      path,
    );
    if (existingId) {
      await get().activate(existingId);
      return true;
    }

    const activeDoc = useDocumentStore.getState();

    // Blank document: load into active tab
    if (isBlankDocument(activeDoc)) {
      const ok = await useDocumentStore.getState().load(path);
      if (ok) {
        useSettingsStore.getState().set('viewMode', 'formatted');
      }
      return ok;
    }

    // Create new tab after active one
    const newBlankSnapshot: TabSnapshot = {
      doc: { ...EMPTY_DOC, loadId: nextLoadId() },
      viewMode: 'formatted',
      topLine: 0,
      needsReload: false,
    };

    await applyAssetRoot(null);

    const currentState = get();
    const currentActiveIdx = currentState.tabs.findIndex((t) => t.id === currentState.activeId);
    const newId = newTabId();
    const insertIdx = currentActiveIdx + 1;

    const outgoing = captureActive();

    set({
      tabs: [
        ...currentState.tabs.slice(0, insertIdx),
        { id: newId, snapshot: null },
        ...currentState.tabs.slice(insertIdx),
      ].map((t, i) => (i === currentActiveIdx ? { ...t, snapshot: outgoing } : t)),
      activeId: newId,
    });

    swapIn(newBlankSnapshot);

    const ok = await useDocumentStore.getState().load(path);
    if (ok) {
      return true;
    }

    // Failed: restore previous tab
    const error = useDocumentStore.getState().error;
    const failState = get();
    const previousTab = failState.tabs[currentActiveIdx];

    set({
      tabs: failState.tabs.filter((t) => t.id !== newId),
      activeId: currentState.activeId,
    });

    if (previousTab.snapshot) {
      await applyAssetRoot(previousTab.snapshot.doc.path);
      swapIn(previousTab.snapshot);
    }

    useDocumentStore.setState({ error });
    return false;
  },

  newTab: async () => {
    const activeDoc = useDocumentStore.getState();

    // Start screen: new document instead of adding tab
    if (!activeDoc.hasDocument) {
      await useDocumentStore.getState().newDocument();
      useSettingsStore.getState().set('viewMode', 'source');
      return;
    }

    // Add tab after active one
    const newBlankSnapshot: TabSnapshot = {
      doc: { ...EMPTY_DOC, hasDocument: true, loadId: nextLoadId() },
      viewMode: 'source',
      topLine: 0,
      needsReload: false,
    };

    await applyAssetRoot(null);

    const state = get();
    const activeIdx = state.tabs.findIndex((t) => t.id === state.activeId);
    const newId = newTabId();
    const insertIdx = activeIdx + 1;

    const outgoing = captureActive();

    set({
      tabs: [
        ...state.tabs.slice(0, insertIdx),
        { id: newId, snapshot: null },
        ...state.tabs.slice(insertIdx),
      ].map((t, i) => (i === activeIdx ? { ...t, snapshot: outgoing } : t)),
      activeId: newId,
    });

    swapIn(newBlankSnapshot);
  },

  close: async (id) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return false;

    const isActive = id === state.activeId;

    // Inactive tab: check if dirty before removing
    if (!isActive) {
      if (tab.snapshot && isDirty(tab.snapshot.doc)) {
        await get().activate(id);
        return get().close(id);
      }

      set({
        tabs: state.tabs.filter((t) => t.id !== id),
      });

      if (tab.snapshot?.doc.path) {
        await unwatchFile(tab.snapshot.doc.path).catch(() => undefined);
      }

      pruneEditorCache(liveLoadIds());
      return true;
    }

    // Active tab
    if (!(await useDocumentStore.getState().confirmDiscard())) {
      return false;
    }

    const closingPath = useDocumentStore.getState().path;
    const currentState = get();
    const currentTabs = currentState.tabs;
    const ids = currentTabs.map((t) => t.id);
    const next = nextActiveAfterClose(ids, id, currentState.activeId);

    if (next) {
      const nextTab = currentTabs.find((t) => t.id === next);
      if (nextTab?.snapshot) {
        await applyAssetRoot(nextTab.snapshot.doc.path);

        const closeState = get();
        const finalNextTab = closeState.tabs.find((t) => t.id === next);
        if (!finalNextTab?.snapshot) return false;

        set({
          tabs: closeState.tabs
            .filter((t) => t.id !== id)
            .map((t) => (t.id === next ? { ...t, snapshot: null } : t)),
          activeId: next,
        });

        swapIn(finalNextTab.snapshot);

        if (finalNextTab.snapshot.needsReload && !isDirty(finalNextTab.snapshot.doc)) {
          await useDocumentStore.getState().reload();
        }
      }
    } else {
      // Last tab: show start screen
      const newTabId_ = newTabId();
      const startScreenSnapshot: TabSnapshot = {
        doc: { ...EMPTY_DOC, loadId: nextLoadId() },
        viewMode: 'formatted',
        topLine: 0,
        needsReload: false,
      };

      await applyAssetRoot(null);

      set({
        tabs: [{ id: newTabId_, snapshot: null }],
        activeId: newTabId_,
      });

      swapIn(startScreenSnapshot);
    }

    if (closingPath) {
      await unwatchFile(closingPath).catch(() => undefined);
    }

    pruneEditorCache(liveLoadIds());
    return true;
  },

  closeOthers: async (id) => {
    const state = get();
    const tabIds = state.tabs.map((t) => t.id).filter((t) => t !== id);

    for (const tabId of tabIds) {
      const currentState = get();
      const tab = currentState.tabs.find((t) => t.id === tabId);
      if (!tab) continue;

      const closed = await get().close(tabId);
      if (!closed) {
        return false;
      }
    }

    // Ensure the target tab is active if it still exists
    const finalState = get();
    if (finalState.tabs.find((t) => t.id === id) && finalState.activeId !== id) {
      await get().activate(id);
    }

    return true;
  },

  closeToRight: async (id) => {
    const state = get();
    const tabIdx = state.tabs.findIndex((t) => t.id === id);
    if (tabIdx < 0) return false;

    const tabIds = state.tabs.slice(tabIdx + 1).map((t) => t.id);

    for (const tabId of tabIds) {
      const currentState = get();
      const tab = currentState.tabs.find((t) => t.id === tabId);
      if (!tab) continue;

      const closed = await get().close(tabId);
      if (!closed) {
        return false;
      }
    }

    // Ensure the target tab is active if it still exists
    const finalState = get();
    if (finalState.tabs.find((t) => t.id === id) && finalState.activeId !== id) {
      await get().activate(id);
    }

    return true;
  },

  confirmCloseAll: async () => {
    const state = get();
    const tabIds = state.tabs.map((t) => t.id);

    for (const tabId of tabIds) {
      const currentState = get();
      const tab = currentState.tabs.find((t) => t.id === tabId);
      if (!tab) continue;

      const isActive = tabId === currentState.activeId;
      const isDirtyTab = isActive
        ? isDirty(useDocumentStore.getState())
        : tab.snapshot
          ? isDirty(tab.snapshot.doc)
          : false;

      if (isDirtyTab) {
        if (!isActive) {
          await get().activate(tabId);
        }
        if (!(await useDocumentStore.getState().confirmDiscard())) {
          return false;
        }
      }
    }

    return true;
  },

  move: (from, to) => {
    set({ tabs: moveItem(get().tabs, from, to) });
  },

  onInactiveFileChanged: (e) => {
    const state = get();
    const tab = state.tabs.find(
      (t) =>
        t.snapshot !== null &&
        t.id !== state.activeId &&
        t.snapshot.doc.path &&
        samePath(t.snapshot.doc.path, e.path),
    );

    if (!tab || !tab.snapshot) return;

    const tabId = tab.id;
    const snapshot = tab.snapshot;

    if (e.removed) {
      set({
        tabs: updateSnapshot(state.tabs, tabId, (s) => ({
          ...s,
          doc: { ...s.doc, externalChange: 'removed' },
        })),
      });
      return;
    }

    if (e.mtime === snapshot.doc.mtime) {
      return;
    }

    if (isDirty(snapshot.doc)) {
      set({
        tabs: updateSnapshot(state.tabs, tabId, (s) => ({
          ...s,
          doc: { ...s.doc, externalChange: 'modified' },
        })),
      });
    } else {
      set({
        tabs: updateSnapshot(state.tabs, tabId, (s) => ({
          ...s,
          needsReload: true,
        })),
      });
    }
  },
}));

// Set up save-target guard and open handler (activeId is initialized in create)
setSaveTargetGuard((target) => {
  const state = useTabsStore.getState();
  const inactiveTab = state.tabs.find(
    (t) =>
      t.snapshot !== null &&
      t.id !== state.activeId &&
      t.snapshot.doc.path &&
      samePath(t.snapshot.doc.path, target),
  );

  if (!inactiveTab || !inactiveTab.snapshot) {
    return 'ok';
  }

  if (isDirty(inactiveTab.snapshot.doc)) {
    return 'blocked';
  }

  // Clean tab: remove it
  useTabsStore.setState({
    tabs: state.tabs.filter((t) => t.id !== inactiveTab.id),
  });
  return 'ok';
});

// Install openPath as the handler for openWithDialog
setOpenHandler(openPath);

/** Returns true if any tab has unsaved changes (active or snapshot). */
export function hasUnsavedTabs(): boolean {
  const state = useTabsStore.getState();
  const activeDoc = useDocumentStore.getState();

  // Check active tab
  if (isDirty(activeDoc)) {
    return true;
  }

  // Check snapshots
  for (const tab of state.tabs) {
    if (tab.snapshot && isDirty(tab.snapshot.doc)) {
      return true;
    }
  }

  return false;
}

/**
 * Opens `path` according to the "Open files in" setting.
 * Tab mode: opens as a new tab (or focuses if already open).
 * Window mode: focuses if already open in this window; otherwise opens here if the window is blank,
 * or opens in a new window.
 */
export async function openPath(path: string): Promise<boolean> {
  const openFilesIn = useSettingsStore.getState().openFilesIn;

  if (openFilesIn === 'tab') {
    return useTabsStore.getState().openInTab(path);
  }

  // window mode
  // Check if already open in this window
  const existingId = findTabByPath(
    useTabsStore.getState().tabs.map((t) => ({ id: t.id, path: pathOf(t) })),
    path,
  );
  if (existingId) {
    await useTabsStore.getState().activate(existingId);
    return true;
  }

  // Not open: check if this window is blank
  const activeDoc = useDocumentStore.getState();
  if (isBlankDocument(activeDoc)) {
    return activeDoc.load(path);
  }

  // Window has content: open in a new window
  return openInNewWindow(path).then(
    () => true,
    (e) => {
      useDocumentStore.setState({ error: `Could not open ${basename(path)}: ${String(e)}` });
      return false;
    },
  );
}

/** Creates a new document the way the "Open files in" setting says: new tab or replace current. */
export async function newDocumentPerSetting(): Promise<void> {
  const openFilesIn = useSettingsStore.getState().openFilesIn;

  if (openFilesIn === 'tab') {
    await useTabsStore.getState().newTab();
  } else {
    // window mode
    if (await useDocumentStore.getState().newDocument()) {
      useSettingsStore.getState().set('viewMode', 'source');
    }
  }
}

/**
 * Opens multiple paths according to the setting.
 * Tab mode: opens all paths as tabs.
 * Window mode: opens all paths, with the first opening in this window (if blank)
 * and the others in new windows.
 */
export async function openPaths(paths: string[]): Promise<void> {
  for (const path of paths) {
    await openPath(path);
  }
}

/**
 * Routes a file from Explorer to either a tab or a new window based on the setting.
 * Tab mode: opens as a tab (or focuses if already open).
 * Window mode: uses openPath, so it respects the blank-window and already-open rules.
 */
export async function routeExternalOpen(path: string): Promise<void> {
  const openFilesIn = useSettingsStore.getState().openFilesIn;

  if (openFilesIn === 'tab') {
    await useTabsStore.getState().openInTab(path);
  } else {
    await openPath(path);
  }
}

/** Whether the tab strip is shown, reading from the settings and tabs stores. */
export function areTabsVisible(): boolean {
  return tabsVisible(useSettingsStore.getState().openFilesIn, useTabsStore.getState().tabs.length);
}

/** Activates the tab at `index`. Does nothing when tabs aren't visible or `index` is out of range.
 * `index === -1` means the last tab (Ctrl+9). */
export async function activateTabAt(index: number): Promise<void> {
  const state = useTabsStore.getState();
  if (!areTabsVisible()) return;
  const actualIndex = index === -1 ? state.tabs.length - 1 : index;
  if (actualIndex < 0 || actualIndex >= state.tabs.length) return;
  await state.activate(state.tabs[actualIndex].id);
}

/** Activates the next or previous tab, wrapping around. Does nothing when tabs aren't visible. */
export async function cycleTab(delta: 1 | -1): Promise<void> {
  if (!areTabsVisible()) return;
  const state = useTabsStore.getState();
  const tabs = state.tabs;
  const activeIdx = tabs.findIndex((t) => t.id === state.activeId);
  if (activeIdx < 0) return;
  await state.activate(tabs[cycleIndex(tabs.length, activeIdx, delta)].id);
}
