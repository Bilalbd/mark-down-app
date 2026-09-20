import { create } from 'zustand';
import { load as loadStore, type Store } from '@tauri-apps/plugin-store';

export type AppTheme = 'light' | 'dark' | 'system';
export type ViewMode = 'formatted' | 'source' | 'split';

export interface Settings {
  appTheme: AppTheme;
  viewMode: ViewMode;
  outlineVisible: boolean;
  outlineWidth: number;
  previewZoom: number;
  editorLineNumbers: boolean;
  editorFontSize: number;
}

const DEFAULTS: Settings = {
  appTheme: 'system',
  viewMode: 'formatted',
  outlineVisible: true,
  outlineWidth: 240,
  previewZoom: 1,
  editorLineNumbers: true,
  editorFontSize: 14,
};

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
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
        if (k in DEFAULTS) (patch as Record<string, unknown>)[k] = v;
      }
      set({ ...patch, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  set: (key, value) => {
    if (get()[key] === value) return;
    set({ [key]: value } as Partial<Settings>);
    void getStore().then((s) => s?.set(key, value));
  },
}));
