import { create } from 'zustand';
import type { EditorView } from '@codemirror/view';
import type { HeadingInfo } from '@/markdown/plugins';

/**
 * Transient UI state shared between the preview, editor and outline:
 * live element handles, the current outline, and the source line at the top of
 * whichever view is active (so switching views preserves position).
 */
interface ViewState {
  headings: HeadingInfo[];
  activeHeadingId: string | null;
  editorView: EditorView | null;
  previewScrollEl: HTMLElement | null;
  /** 0-based source line currently at the top of the visible view. */
  topLine: number;
  /** Set to request a scroll to a line; consumers clear it after honouring it. */
  pendingScrollLine: number | null;
  settingsOpen: boolean;
  findOpen: boolean;
  /** Incremented every time the preview DOM is replaced, so dependents can re-scan it. */
  previewVersion: number;
  /** Current cursor position in the editor (1-based line and column). null in Formatted view. */
  cursor: { line: number; col: number } | null;
  /** Number of words in the current selection. null if selection is empty. */
  selectionWords: number | null;
  /** Windows' installed spelling dictionaries (BCP-47 tags), fetched once and shared by the
   * editor (automatic-language fallback) and Settings (the language checklist). */
  spellSupportedLanguages: string[];
  /** Words marked "Ignore" from the spelling right-click menu, lower-cased. Lasts until the app
   * closes (every tab in the window); never saved. */
  spellIgnored: ReadonlySet<string>;

  setHeadings: (h: HeadingInfo[]) => void;
  setActiveHeadingId: (id: string | null) => void;
  setEditorView: (v: EditorView | null) => void;
  setPreviewScrollEl: (el: HTMLElement | null) => void;
  setTopLine: (line: number) => void;
  requestScrollToLine: (line: number) => void;
  clearPendingScroll: () => void;
  setSettingsOpen: (open: boolean) => void;
  setFindOpen: (open: boolean) => void;
  bumpPreviewVersion: () => void;
  setCursor: (c: { line: number; col: number } | null) => void;
  setSelectionWords: (w: number | null) => void;
  setSpellSupportedLanguages: (langs: string[]) => void;
  /** Adds `word` (lower-cased) to the session's ignore list. */
  ignoreWord: (word: string) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  headings: [],
  activeHeadingId: null,
  editorView: null,
  previewScrollEl: null,
  topLine: 0,
  pendingScrollLine: null,
  settingsOpen: false,
  findOpen: false,
  previewVersion: 0,
  cursor: null,
  selectionWords: null,
  spellSupportedLanguages: [],
  spellIgnored: new Set(),

  setHeadings: (headings) => set({ headings }),
  setActiveHeadingId: (activeHeadingId) => set({ activeHeadingId }),
  setEditorView: (editorView) => set({ editorView }),
  setPreviewScrollEl: (previewScrollEl) => set({ previewScrollEl }),
  setTopLine: (topLine) => set({ topLine }),
  requestScrollToLine: (pendingScrollLine) => set({ pendingScrollLine }),
  clearPendingScroll: () => set({ pendingScrollLine: null }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setFindOpen: (findOpen) => set({ findOpen }),
  bumpPreviewVersion: () => set((s) => ({ previewVersion: s.previewVersion + 1 })),
  setCursor: (cursor) => set({ cursor }),
  setSelectionWords: (selectionWords) => set({ selectionWords }),
  setSpellSupportedLanguages: (spellSupportedLanguages) => set({ spellSupportedLanguages }),
  ignoreWord: (word) =>
    set((s) => ({ spellIgnored: new Set(s.spellIgnored).add(word.toLocaleLowerCase()) })),
}));
