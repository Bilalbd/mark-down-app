import { create } from 'zustand';
import {
  DocFields,
  EMPTY_DOC,
  isDirty,
  nextLoadId,
  pickDocFields,
  setSaveTargetGuard,
  useDocumentStore,
} from '@/store/document';
import { useSettingsStore, type ViewMode } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { dirname, isTauri, setAssetRoot, unwatchFile, type FileChangedEvent } from '@/lib/tauri';
import {
  findTabByPath,
  isBlankDocument,
  moveItem,
  nextActiveAfterClose,
  samePath,
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
  /** Open a file by path, activating an existing tab or creating a new one. */
  openInTab: (path: string) => Promise<boolean>;
  /** Create a new blank tab or new document if none is open. */
  newTab: () => Promise<void>;
  /** Activate a tab by id. */
  activate: (id: string) => Promise<void>;
  /** Close a tab, prompting about unsaved changes. Returns false if cancelled. */
  close: (id: string) => Promise<boolean>;
  /** Ask about unsaved changes on each dirty tab in order. Returns false if cancelled. */
  confirmCloseAll: () => Promise<boolean>;
  /** Move a tab from one position to another. */
  move: (from: number, to: number) => void;
  /** Handle a file-change event for an inactive tab. */
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

/** Puts a snapshot on screen. */
async function showSnapshot(snap: TabSnapshot): Promise<void> {
  if (isTauri()) {
    await setAssetRoot(snap.doc.path ? dirname(snap.doc.path) : null).catch(() => undefined);
  }
  useViewStore.getState().setFindOpen(false);
  useViewStore.getState().setTopLine(snap.topLine);
  useDocumentStore.setState(snap.doc);
  useSettingsStore.getState().set('viewMode', snap.viewMode);
  if (snap.topLine > 0) {
    useViewStore.getState().requestScrollToLine(snap.topLine);
  }
  if (snap.needsReload && !isDirty(snap.doc)) {
    await useDocumentStore.getState().reload();
  }
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [{ id: newTabId(), snapshot: null }],
  activeId: '',

  activate: async (id) => {
    const state = get();
    if (id === state.activeId) return;
    const incomingTab = state.tabs.find((t) => t.id === id);
    if (!incomingTab || incomingTab.snapshot === null) return;

    const outgoing = captureActive();
    const activeIdx = state.tabs.findIndex((t) => t.id === state.activeId);
    const incomingIdx = state.tabs.findIndex((t) => t.id === id);

    set({
      tabs: state.tabs.map((t, i) => {
        if (i === activeIdx) return { ...t, snapshot: outgoing };
        if (i === incomingIdx) return { ...t, snapshot: null };
        return t;
      }),
      activeId: id,
    });

    await showSnapshot(incomingTab.snapshot);
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

    const state = get();
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
    const outgoing = captureActive();
    const activeIdx = state.tabs.findIndex((t) => t.id === state.activeId);
    const newId = newTabId();
    const insertIdx = activeIdx + 1;

    set({
      tabs: [
        ...state.tabs.slice(0, insertIdx),
        { id: newId, snapshot: null },
        ...state.tabs.slice(insertIdx),
      ].map((t, i) => (i === activeIdx ? { ...t, snapshot: outgoing } : t)),
      activeId: newId,
    });

    await showSnapshot({
      doc: { ...EMPTY_DOC, loadId: nextLoadId() },
      viewMode: 'formatted',
      topLine: 0,
      needsReload: false,
    });

    const ok = await useDocumentStore.getState().load(path);
    if (ok) {
      return true;
    }

    // Failed: restore previous tab
    const error = useDocumentStore.getState().error;
    const currentState = get();
    const previousTab = currentState.tabs[activeIdx];

    set({
      tabs: currentState.tabs.filter((t) => t.id !== newId),
      activeId: state.activeId,
    });

    if (previousTab.snapshot) {
      await showSnapshot(previousTab.snapshot);
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
    const state = get();
    const outgoing = captureActive();
    const activeIdx = state.tabs.findIndex((t) => t.id === state.activeId);
    const newId = newTabId();
    const insertIdx = activeIdx + 1;

    set({
      tabs: [
        ...state.tabs.slice(0, insertIdx),
        { id: newId, snapshot: null },
        ...state.tabs.slice(insertIdx),
      ].map((t, i) => (i === activeIdx ? { ...t, snapshot: outgoing } : t)),
      activeId: newId,
    });

    await showSnapshot({
      doc: { ...EMPTY_DOC, hasDocument: true, loadId: nextLoadId() },
      viewMode: 'source',
      topLine: 0,
      needsReload: false,
    });
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
      return true;
    }

    // Active tab
    if (!(await useDocumentStore.getState().confirmDiscard())) {
      return false;
    }

    const closingPath = useDocumentStore.getState().path;
    const ids = state.tabs.map((t) => t.id);
    const next = nextActiveAfterClose(ids, id, state.activeId);

    if (next) {
      const nextTab = state.tabs.find((t) => t.id === next);
      if (nextTab?.snapshot) {
        set({
          tabs: state.tabs.filter((t) => t.id !== id),
          activeId: next,
        });
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === next ? { ...t, snapshot: null } : t)),
        }));
        await showSnapshot(nextTab.snapshot);
      }
    } else {
      // Last tab: show start screen
      set({
        tabs: [{ id: newTabId(), snapshot: null }],
        activeId: '',
      });

      await showSnapshot({
        doc: { ...EMPTY_DOC, loadId: nextLoadId() },
        viewMode: 'formatted',
        topLine: 0,
        needsReload: false,
      });

      set((s) => ({
        activeId: s.tabs[0].id,
      }));
    }

    if (closingPath) {
      await unwatchFile(closingPath).catch(() => undefined);
    }
    return true;
  },

  confirmCloseAll: async () => {
    const state = get();

    for (const tab of state.tabs) {
      const isActive = tab.id === state.activeId;
      const isDirtyTab = isActive
        ? isDirty(useDocumentStore.getState())
        : tab.snapshot
          ? isDirty(tab.snapshot.doc)
          : false;

      if (isDirtyTab) {
        if (!isActive) {
          await get().activate(tab.id);
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
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.snapshot
            ? {
                id: t.id,
                snapshot: {
                  doc: { ...t.snapshot.doc, externalChange: 'removed' },
                  viewMode: t.snapshot.viewMode,
                  topLine: t.snapshot.topLine,
                  needsReload: t.snapshot.needsReload,
                },
              }
            : t,
        ),
      });
      return;
    }

    if (e.mtime === snapshot.doc.mtime) {
      return;
    }

    if (isDirty(snapshot.doc)) {
      set({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.snapshot
            ? {
                id: t.id,
                snapshot: {
                  doc: { ...t.snapshot.doc, externalChange: 'modified' },
                  viewMode: t.snapshot.viewMode,
                  topLine: t.snapshot.topLine,
                  needsReload: t.snapshot.needsReload,
                },
              }
            : t,
        ),
      });
    } else {
      set({
        tabs: state.tabs.map((t) =>
          t.id === tabId && t.snapshot
            ? {
                id: t.id,
                snapshot: {
                  doc: t.snapshot.doc,
                  viewMode: t.snapshot.viewMode,
                  topLine: t.snapshot.topLine,
                  needsReload: true,
                },
              }
            : t,
        ),
      });
    }
  },
}));

// Initialize the first tab's id and set up save-target guard
{
  const initialId = useTabsStore.getState().tabs[0].id;
  useTabsStore.setState({ activeId: initialId });

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
}
