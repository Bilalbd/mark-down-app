import { create } from 'zustand';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { askSaveChanges } from '@/components/Dialog/ConfirmDialog';
import {
  allowAssetDir,
  basename,
  dirname,
  isTauri,
  readFile,
  unwatchFile,
  watchFile,
  writeFile,
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
      const { content, mtime } = await readFile(path);
      await allowAssetDir(dirname(path)).catch(() => undefined);
      set({
        path,
        hasDocument: true,
        content,
        savedContent: content,
        mtime,
        error: null,
        externalChange: null,
      });
      await watchFile(path).catch(() => undefined);
      return true;
    } catch (e) {
      set({ error: `Could not open ${basename(path)}: ${String(e)}` });
      return false;
    }
  },

  openWithDialog: async () => {
    if (!isTauri()) {
      // Browser fallback (Vite dev without Tauri): read a local file via <input type=file>.
      const file = await pickBrowserFile();
      if (file && (await get().confirmDiscard())) {
        const content = await file.text();
        set({
          path: file.name,
          hasDocument: true,
          content,
          savedContent: content,
          mtime: file.lastModified,
          error: null,
          externalChange: null,
        });
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
    if (isTauri()) await unwatchFile().catch(() => undefined);
    set({
      path: null,
      hasDocument: true,
      content: '',
      savedContent: '',
      mtime: 0,
      error: null,
      externalChange: null,
    });
    return true;
  },

  saveAs: async () => {
    if (!isTauri()) return false;
    const target = await saveDialog({
      defaultPath: get().path ?? 'Untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (!target) return false;
    const { content } = get();
    try {
      const mtime = await writeFile(target, content);
      set({ path: target, savedContent: content, mtime, error: null, externalChange: null });
      await allowAssetDir(dirname(target)).catch(() => undefined);
      await watchFile(target).catch(() => undefined);
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
      const { content, mtime } = await readFile(path);
      set({ content, savedContent: content, mtime, error: null, externalChange: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setContent: (content) => set({ content }),

  save: async () => {
    const { path, content, hasDocument } = get();
    if (!hasDocument) return false;
    if (!path) return get().saveAs();
    try {
      const mtime = await writeFile(path, content);
      set({ savedContent: content, mtime, error: null, externalChange: null });
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
