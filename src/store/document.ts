import { create } from 'zustand';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { askSaveChanges, useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { useSettingsStore } from '@/store/settings';
import { applyEol, normalizeEol, type Eol } from '@/lib/eol';
import {
  basename,
  dirname,
  isTauri,
  readFile,
  setAssetRoot,
  unwatchFile,
  watchFile,
  writeFile,
  type Encoding,
  type FileChangedEvent,
} from '@/lib/tauri';

export type ExternalChange = 'modified' | 'removed' | null;

export interface DocumentState {
  /** Absolute path, or null for a new document that has not been saved yet. */
  path: string | null;
  /** True once a document (opened or new) is loaded and the editor should be shown. */
  hasDocument: boolean;
  content: string;
  savedContent: string;
  mtime: number;
  /** Line ending to restore on save; the in-memory content is always LF-normalised. */
  eol: Eol;
  /** Text encoding to restore on save. */
  encoding: Encoding;
  /** True when the file had bytes that aren't valid text, replaced with U+FFFD on
   * load; saving asks for confirmation first, since it would make that permanent. */
  lossy: boolean;
  /** Incremented by open/newDocument/reload (not by setContent/save/saveAs), so the
   * editor can tell a fresh load apart from ordinary edits and reset undo history. */
  loadId: number;
  error: string | null;
  /**
   * Set when the file changed on disk while there are unsaved edits, so the UI can
   * offer Reload / Keep mine instead of silently overwriting the user's work.
   */
  externalChange: ExternalChange;

  /** Open a file by path; prompts if the current document has unsaved changes. */
  open: (path: string) => Promise<boolean>;
  /** Show the OS open dialog. */
  openWithDialog: () => Promise<void>;
  /** Start a new, unsaved document (prompts if the current one has unsaved changes). */
  newDocument: () => Promise<boolean>;
  /** Save to a location chosen in the OS dialog. */
  saveAs: () => Promise<boolean>;
  /** Re-read the current file from disk (used by live reload). */
  reload: () => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<boolean>;
  /** Returns true if it is safe to discard/replace the current document. */
  confirmDiscard: () => Promise<boolean>;
  /** Handle a change notification from the file watcher. */
  onFileChanged: (e: FileChangedEvent) => Promise<void>;
  dismissExternalChange: () => void;
}

export const isDirty = (s: Pick<DocumentState, 'content' | 'savedContent'>) =>
  s.content !== s.savedContent;

export const useDocumentStore = create<DocumentState>((set, get) => ({
  path: null,
  hasDocument: false,
  content: '',
  savedContent: '',
  mtime: 0,
  eol: '\n',
  encoding: 'utf8',
  lossy: false,
  loadId: 0,
  error: null,
  externalChange: null,

  confirmDiscard: async () => {
    const state = get();
    if (!isDirty(state)) return true;
    const choice = await askSaveChanges(state.path ? basename(state.path) : 'Untitled');
    if (choice === null) return false;
    if (choice === 'save') return get().save();
    return true;
  },

  open: async (path) => {
    if (!(await get().confirmDiscard())) return false;
    try {
      const { content: raw, mtime, encoding, lossy } = await readFile(path);
      const { text: content, eol } = normalizeEol(raw);
      await setAssetRoot(dirname(path)).catch(() => undefined);
      set((s) => ({
        path,
        hasDocument: true,
        content,
        savedContent: content,
        mtime,
        eol,
        encoding,
        lossy,
        loadId: s.loadId + 1,
        error: null,
        externalChange: null,
      }));
      await watchFile(path).catch(() => undefined);
      useSettingsStore.getState().addRecentFile(path);
      return true;
    } catch (e) {
      set({ error: `Could not open ${basename(path)}: ${String(e)}` });
      useSettingsStore.getState().removeRecentFile(path);
      return false;
    }
  },

  openWithDialog: async () => {
    if (!isTauri()) {
      // Browser fallback (Vite dev without Tauri): read a local file via <input type=file>.
      const file = await pickBrowserFile();
      if (file && (await get().confirmDiscard())) {
        const raw = await file.text();
        const { text: content, eol } = normalizeEol(raw);
        set((s) => ({
          path: file.name,
          hasDocument: true,
          content,
          savedContent: content,
          mtime: file.lastModified,
          eol,
          encoding: 'utf8',
          lossy: false,
          loadId: s.loadId + 1,
          error: null,
          externalChange: null,
        }));
      }
      return;
    }
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (typeof selected === 'string') await get().open(selected);
  },

  newDocument: async () => {
    if (!(await get().confirmDiscard())) return false;
    if (isTauri()) {
      await unwatchFile().catch(() => undefined);
      await setAssetRoot(null).catch(() => undefined);
    }
    set((s) => ({
      path: null,
      hasDocument: true,
      content: '',
      savedContent: '',
      mtime: 0,
      eol: '\n',
      encoding: 'utf8',
      lossy: false,
      loadId: s.loadId + 1,
      error: null,
      externalChange: null,
    }));
    return true;
  },

  saveAs: async () => {
    if (!isTauri()) return false;
    if (get().lossy && !(await confirmLossySave())) return false;
    const target = await saveDialog({
      defaultPath: get().path ?? 'Untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (!target) return false;
    const { content, eol, encoding } = get();
    try {
      const mtime = await writeFile(target, applyEol(content, eol), encoding);
      set({
        path: target,
        savedContent: content,
        mtime,
        error: null,
        externalChange: null,
        lossy: false,
      });
      await setAssetRoot(dirname(target)).catch(() => undefined);
      await watchFile(target).catch(() => undefined);
      useSettingsStore.getState().addRecentFile(target);
      return true;
    } catch (e) {
      set({ error: `Could not save: ${String(e)}` });
      return false;
    }
  },

  reload: async () => {
    const { path } = get();
    if (!path) return;
    try {
      const { content: raw, mtime, encoding, lossy } = await readFile(path);
      const { text: content, eol } = normalizeEol(raw);
      set((s) => ({
        content,
        savedContent: content,
        mtime,
        eol,
        encoding,
        lossy,
        loadId: s.loadId + 1,
        error: null,
        externalChange: null,
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setContent: (content) => set({ content }),

  save: async () => {
    const { path, content, eol, encoding, lossy, hasDocument } = get();
    if (!hasDocument) return false;
    if (!path) return get().saveAs();
    if (lossy && !(await confirmLossySave())) return false;
    try {
      const mtime = await writeFile(path, applyEol(content, eol), encoding);
      set({ savedContent: content, mtime, error: null, externalChange: null, lossy: false });
      return true;
    } catch (e) {
      set({ error: `Could not save: ${String(e)}` });
      return false;
    }
  },

  onFileChanged: async (e) => {
    const state = get();
    if (!state.path || e.path !== state.path) return;
    if (e.removed) {
      set({ externalChange: 'removed' });
      return;
    }
    // Our own save produces an event too; the mtime we recorded identifies it.
    if (e.mtime === state.mtime) return;
    if (isDirty(state)) {
      set({ externalChange: 'modified' });
    } else {
      await get().reload();
    }
  },

  dismissExternalChange: () => set({ externalChange: null }),
}));

function confirmLossySave(): Promise<boolean> {
  return useDialogStore
    .getState()
    .show(
      'Save with replaced characters?',
      "This file contained bytes that aren't valid text. Saving will replace them with �.",
      [
        { id: 'save', label: 'Save anyway', primary: true, danger: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    )
    .then((choice) => choice === 'save');
}

function pickBrowserFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
