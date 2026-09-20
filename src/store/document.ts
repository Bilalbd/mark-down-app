import { create } from 'zustand';
import { open as openDialog, ask } from '@tauri-apps/plugin-dialog';
import { allowAssetDir, basename, dirname, isTauri, readFile, writeFile } from '@/lib/tauri';

export interface DocumentState {
  path: string | null;
  content: string;
  savedContent: string;
  mtime: number;
  error: string | null;

  /** Open a file by path; prompts if the current document has unsaved changes. */
  open: (path: string) => Promise<boolean>;
  /** Show the OS open dialog. */
  openWithDialog: () => Promise<void>;
  /** Re-read the current file from disk (used by live reload). */
  reload: () => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<boolean>;
  /** Returns true if it is safe to discard/replace the current document. */
  confirmDiscard: () => Promise<boolean>;
}

export const isDirty = (s: Pick<DocumentState, 'content' | 'savedContent'>) =>
  s.content !== s.savedContent;

export const useDocumentStore = create<DocumentState>((set, get) => ({
  path: null,
  content: '',
  savedContent: '',
  mtime: 0,
  error: null,

  confirmDiscard: async () => {
    if (!isDirty(get())) return true;
    if (!isTauri()) return window.confirm('Discard unsaved changes?');
    const save = await ask('You have unsaved changes. Save them before continuing?', {
      title: 'Unsaved changes',
      kind: 'warning',
      okLabel: 'Save',
      cancelLabel: "Don't save",
    });
    if (save) return get().save();
    return true;
  },

  open: async (path) => {
    if (!(await get().confirmDiscard())) return false;
    try {
      const { content, mtime } = await readFile(path);
      await allowAssetDir(dirname(path)).catch(() => undefined);
      set({ path, content, savedContent: content, mtime, error: null });
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
          content,
          savedContent: content,
          mtime: file.lastModified,
          error: null,
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

  reload: async () => {
    const { path } = get();
    if (!path) return;
    try {
      const { content, mtime } = await readFile(path);
      set({ content, savedContent: content, mtime, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setContent: (content) => set({ content }),

  save: async () => {
    const { path, content } = get();
    if (!path) return false;
    try {
      const mtime = await writeFile(path, content);
      set({ savedContent: content, mtime, error: null });
      return true;
    } catch (e) {
      set({ error: `Could not save: ${String(e)}` });
      return false;
    }
  },
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
