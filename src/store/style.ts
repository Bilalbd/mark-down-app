import { create } from 'zustand';
import { load as loadStore, type Store } from '@tauri-apps/plugin-store';
import githubPreset from '@/styles/presets/github.json';
import obsidianPreset from '@/styles/presets/obsidian.json';
import claudePreset from '@/styles/presets/claude.json';
import boulaylaPreset from '@/styles/presets/boulayla.json';
import manuscriptPreset from '@/styles/presets/manuscript.json';
import nordPreset from '@/styles/presets/nord.json';
import rosePinePreset from '@/styles/presets/rose-pine.json';
import catppuccinPreset from '@/styles/presets/catppuccin.json';
import solarizedPreset from '@/styles/presets/solarized.json';

export interface ColorSet {
  bg: string;
  text: string;
  heading: string;
  link: string;
  muted: string;
  border: string;
  codeBg: string;
  codeText: string;
  quoteBorder: string;
  quoteText: string;
  tableBorder: string;
  tableStripe: string;
  hr: string;
}

export interface Typography {
  bodyFont: string;
  headingFont: string;
  monoFont: string;
  /** Base font size in px. */
  baseSize: number;
  lineHeight: number;
  /** Max content width in px. */
  contentWidth: number;
  /** Space between blocks, in em. */
  paragraphSpacing: number;
  /** Heading weight (400–800). */
  headingWeight: number;
}

export interface StylePreset {
  id: string;
  name: string;
  builtin?: boolean;
  typography: Typography;
  /** h1..h6 font sizes as multiples of the base size. */
  headingScale: [number, number, number, number, number, number];
  colors: { light: ColorSet; dark: ColorSet };
  customCss: string;
}

export const COLOR_LABELS: Record<keyof ColorSet, string> = {
  bg: 'Background',
  text: 'Text',
  heading: 'Headings',
  link: 'Links',
  muted: 'Muted text',
  border: 'Heading rules',
  codeBg: 'Code background',
  codeText: 'Inline code text',
  quoteBorder: 'Quote bar',
  quoteText: 'Quote text',
  tableBorder: 'Table borders',
  tableStripe: 'Table stripe',
  hr: 'Horizontal rule',
};

/** Built-in presets in display order; the first one is the default. */
export const BUILTIN_PRESETS: StylePreset[] = [
  boulaylaPreset as StylePreset,
  githubPreset as StylePreset,
  obsidianPreset as StylePreset,
  claudePreset as StylePreset,
  manuscriptPreset as StylePreset,
  nordPreset as StylePreset,
  rosePinePreset as StylePreset,
  catppuccinPreset as StylePreset,
  solarizedPreset as StylePreset,
];

interface Persisted {
  activePresetId: string;
  userPresets: StylePreset[];
}

interface StyleState {
  presets: StylePreset[];
  activePresetId: string;
  loaded: boolean;

  load: () => Promise<void>;
  active: () => StylePreset;
  setActive: (id: string) => void;
  /**
   * Apply a change to the active preset. If the active preset is built-in, it is
   * duplicated into an editable user preset first and that becomes active.
   */
  updateActive: (patch: (p: StylePreset) => StylePreset) => void;
  duplicate: (id: string, name?: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  importPreset: (json: string) => { ok: true; id: string } | { ok: false; error: string };
  exportPreset: (id: string) => string;
  /** Re-reads presets from disk, for when another window may have changed them. */
  refresh: () => Promise<void>;
}

let store: Store | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function getStore(): Promise<Store | null> {
  if (store) return store;
  try {
    store = await loadStore('presets.json', { autoSave: false });
    return store;
  } catch {
    return null;
  }
}

/** Parses and normalizes user presets from disk. */
function parseUserPresets(raw: StylePreset[]): StylePreset[] {
  return raw
    .map((p) => normalizePreset(p, p.id ?? newId()))
    .filter((p): p is StylePreset => p !== null);
}

function persist(state: Pick<StyleState, 'presets' | 'activePresetId'>) {
  const data: Persisted = {
    activePresetId: state.activePresetId,
    userPresets: state.presets.filter((p) => !p.builtin),
  };
  writeChain = writeChain
    .then(async () => {
      const s = await getStore();
      if (!s) return;
      await s.reload();
      await s.set('activePresetId', data.activePresetId);
      await s.set('userPresets', data.userPresets);
      await s.save();
    })
    .catch(() => undefined); // Failed writes mustn't block later writes; in-memory value is still right for this session
}

const newId = () => `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Validates an imported preset loosely and fills gaps from the GitHub preset. */
export function normalizePreset(input: unknown, id: string): StylePreset | null {
  if (!input || typeof input !== 'object') return null;
  const src = input as Partial<StylePreset>;
  const base = BUILTIN_PRESETS[0];
  if (typeof src.name !== 'string' || !src.name.trim()) return null;
  const colors = src.colors ?? base.colors;
  return {
    id,
    name: src.name.trim(),
    typography: { ...base.typography, ...(src.typography ?? {}) },
    headingScale:
      Array.isArray(src.headingScale) && src.headingScale.length === 6
        ? (src.headingScale.map(Number) as StylePreset['headingScale'])
        : base.headingScale,
    colors: {
      light: { ...base.colors.light, ...(colors.light ?? {}) },
      dark: { ...base.colors.dark, ...(colors.dark ?? {}) },
    },
    customCss: typeof src.customCss === 'string' ? src.customCss : '',
  };
}

export const useStyleStore = create<StyleState>((set, get) => ({
  presets: BUILTIN_PRESETS,
  activePresetId: BUILTIN_PRESETS[0].id,
  loaded: false,

  load: async () => {
    const s = await getStore();
    if (s) {
      const activePresetId = (await s.get<string>('activePresetId')) ?? BUILTIN_PRESETS[0].id;
      const raw = (await s.get<StylePreset[]>('userPresets')) ?? [];
      const userPresets = parseUserPresets(raw);
      const presets = [...BUILTIN_PRESETS, ...userPresets];
      set({
        presets,
        activePresetId: presets.some((p) => p.id === activePresetId)
          ? activePresetId
          : BUILTIN_PRESETS[0].id,
        loaded: true,
      });
    } else {
      set({ loaded: true });
    }
  },

  active: () => {
    const { presets, activePresetId } = get();
    return presets.find((p) => p.id === activePresetId) ?? BUILTIN_PRESETS[0];
  },

  setActive: (id) => {
    if (!get().presets.some((p) => p.id === id)) return;
    set({ activePresetId: id });
    persist(get());
  },

  updateActive: (patch) => {
    let { activePresetId } = get();
    const current = get().active();
    if (current.builtin) {
      activePresetId = get().duplicate(current.id, `${current.name} (custom)`);
    }
    set((s) => ({
      activePresetId,
      presets: s.presets.map((p) =>
        p.id === activePresetId ? { ...patch(p), id: activePresetId, builtin: false } : p,
      ),
    }));
    persist(get());
  },

  duplicate: (id, name) => {
    const src = get().presets.find((p) => p.id === id);
    if (!src) return get().activePresetId;
    const copy: StylePreset = {
      ...structuredClone(src),
      id: newId(),
      name: name ?? `${src.name} copy`,
      builtin: false,
    };
    set((s) => ({ presets: [...s.presets, copy] }));
    persist(get());
    return copy.id;
  },

  rename: (id, name) => {
    set((s) => ({
      presets: s.presets.map((p) => (p.id === id && !p.builtin ? { ...p, name } : p)),
    }));
    persist(get());
  },

  remove: (id) => {
    const target = get().presets.find((p) => p.id === id);
    if (!target || target.builtin) return;
    set((s) => ({
      presets: s.presets.filter((p) => p.id !== id),
      activePresetId: s.activePresetId === id ? BUILTIN_PRESETS[0].id : s.activePresetId,
    }));
    persist(get());
  },

  importPreset: (json) => {
    try {
      const preset = normalizePreset(JSON.parse(json), newId());
      if (!preset) return { ok: false, error: 'Not a valid preset (missing name).' };
      set((s) => ({ presets: [...s.presets, preset], activePresetId: preset.id }));
      persist(get());
      return { ok: true, id: preset.id };
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${String(e)}` };
    }
  },

  exportPreset: (id) => {
    const p = get().presets.find((x) => x.id === id) ?? get().active();
    const rest: Partial<StylePreset> = { ...p };
    delete rest.id;
    delete rest.builtin;
    return JSON.stringify(rest, null, 2);
  },

  refresh: async () => {
    // Queue through writeChain to avoid races with pending writes
    return new Promise<void>((resolve) => {
      writeChain = writeChain
        .then(async () => {
          const s = await getStore();
          if (!s) return;
          await s.reload();
          const activePresetId = (await s.get<string>('activePresetId')) ?? BUILTIN_PRESETS[0].id;
          const raw = (await s.get<StylePreset[]>('userPresets')) ?? [];
          const userPresets = parseUserPresets(raw);
          const presets = [...BUILTIN_PRESETS, ...userPresets];
          const finalActiveId = presets.some((p) => p.id === activePresetId)
            ? activePresetId
            : BUILTIN_PRESETS[0].id;

          // Skip update if nothing changed: compare serialized user presets and active id
          const current = get();
          const currentUserPresets = current.presets.filter((p) => !p.builtin);
          const newUserPresets = presets.filter((p) => !p.builtin);
          if (
            JSON.stringify(currentUserPresets) === JSON.stringify(newUserPresets) &&
            current.activePresetId === finalActiveId
          ) {
            return;
          }
          set({ presets, activePresetId: finalActiveId });
        })
        .catch(() => undefined);
      writeChain.then(() => resolve()).catch(() => resolve());
    });
  },
}));

/** Queues a refresh through the write chain to avoid races with pending writes. */
export async function queueStyleRefresh(): Promise<void> {
  return new Promise<void>((resolve) => {
    writeChain = writeChain
      .then(async () => {
        await useStyleStore.getState().refresh();
      })
      .catch(() => undefined);
    writeChain.then(() => resolve()).catch(() => resolve());
  });
}
