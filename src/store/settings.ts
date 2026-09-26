import { create } from 'zustand';
import { load as loadStore, type Store } from '@tauri-apps/plugin-store';

export type AppTheme = 'light' | 'dark' | 'system';
export type ViewMode = 'formatted' | 'source' | 'split';
export type SplitSide = 'left' | 'right';
export type OpenFilesIn = 'tab' | 'window';

export interface Settings {
  appTheme: AppTheme;
  viewMode: ViewMode;
  outlineVisible: boolean;
  outlineWidth: number;
  previewZoom: number;
  editorLineNumbers: boolean;
  editorFontSize: number;
  splitRatio: number;
  /** Which side the source editor sits on in Split view. */
  splitEditorSide: SplitSide;
  /** Absolute paths of the most recently opened files, newest first. */
  recentFiles: string[];
  /** Strips remote (http/https) image sources from the preview instead of loading them. */
  blockRemoteImages: boolean;
  /** Whether files opened from Explorer or inside the app become tabs or separate windows. */
  openFilesIn: OpenFilesIn;
  /** Formatted view fills the window width instead of the preset's content width. */
  previewFullWidth: boolean;
}

const MAX_RECENT_FILES = 5;

/**
 * Settings that live in memory and change during a session but are never written to
 * or restored from disk - the app should always come up in a known, predictable state
 * for these, regardless of how the previous session ended.
 */
const EPHEMERAL_KEYS: ReadonlySet<keyof Settings> = new Set(['viewMode']);

const DEFAULTS: Settings = {
  appTheme: 'dark',
  viewMode: 'formatted',
  outlineVisible: true,
  outlineWidth: 240,
  previewZoom: 1,
  editorLineNumbers: true,
  editorFontSize: 14,
  splitRatio: 0.5,
  splitEditorSide: 'left',
  recentFiles: [],
  blockRemoteImages: false,
  openFilesIn: 'tab',
  previewFullWidth: false,
};

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  /** `persist: false` updates in-memory state only, skipping the disk write - for
   * high-frequency updates (drag resize) that call `persist()` once at the end. */
  set: <K extends keyof Settings>(key: K, value: Settings[K], opts?: { persist?: boolean }) => void;
  /** Writes the current value of `key` to disk (see `set`'s `persist: false`). */
  persist: <K extends keyof Settings>(key: K) => void;
  /** Re-reads `key` from disk (another window's process may have changed it). */
  refresh: <K extends keyof Settings>(key: K) => Promise<void>;
  /** Moves `path` to the front of recentFiles, deduped and capped. */
  addRecentFile: (path: string) => void;
  /** Drops `path` from recentFiles (e.g. it became unreadable or was moved). */
  removeRecentFile: (path: string) => void;
}

let store: Store | null = null;

async function getStore(): Promise<Store | null> {
  if (store) return store;
  try {
    store = await loadStore('settings.json', { autoSave: true, defaults: { ...DEFAULTS } });
    return store;
  } catch {
    // Not running inside Tauri (e.g. plain Vite dev or tests) — fall back to memory only.
    return null;
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    const s = await getStore();
    if (s) {
      const entries = await s.entries<Settings[keyof Settings]>();
      const patch: Partial<Settings> = {};
      for (const [k, v] of entries) {
        if (k in DEFAULTS && !EPHEMERAL_KEYS.has(k as keyof Settings)) {
          (patch as Record<string, unknown>)[k] = v;
        }
      }
      set({ ...patch, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  set: (key, value, opts) => {
    if (get()[key] === value) return;
    set({ [key]: value } as Partial<Settings>);
    if (EPHEMERAL_KEYS.has(key) || opts?.persist === false) return;
    void getStore().then((s) => s?.set(key, value));
  },

  persist: (key) => {
    if (EPHEMERAL_KEYS.has(key)) return;
    void getStore().then((s) => s?.set(key, get()[key]));
  },

  refresh: async <K extends keyof Settings>(key: K) => {
    const s = await getStore();
    if (!s) return;
    await s.reload();
    const v = await s.get<Settings[K]>(key);
    if (v !== undefined) set({ [key]: v } as Partial<Settings>);
  },

  addRecentFile: (path) => {
    const next = [path, ...get().recentFiles.filter((p) => p !== path)].slice(0, MAX_RECENT_FILES);
    get().set('recentFiles', next);
  },

  removeRecentFile: (path) => {
    const next = get().recentFiles.filter((p) => p !== path);
    if (next.length === get().recentFiles.length) return;
    get().set('recentFiles', next);
  },
}));

/** Whether the preview should ignore the preset's content width (Formatted view only, not Split). */
export function isPreviewFullWidth(s: Pick<Settings, 'previewFullWidth' | 'viewMode'>): boolean {
  return s.previewFullWidth && s.viewMode === 'formatted';
}
