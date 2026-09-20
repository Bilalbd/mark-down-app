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

  setHeadings: (h: HeadingInfo[]) => void;
  setActiveHeadingId: (id: string | null) => void;
  setEditorView: (v: EditorView | null) => void;
  setPreviewScrollEl: (el: HTMLElement | null) => void;
  setTopLine: (line: number) => void;
  requestScrollToLine: (line: number) => void;
  clearPendingScroll: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  headings: [],
  activeHeadingId: null,
  editorView: null,
  previewScrollEl: null,
  topLine: 0,
  pendingScrollLine: null,
  settingsOpen: false,

  setHeadings: (headings) => set({ headings }),
  setActiveHeadingId: (activeHeadingId) => set({ activeHeadingId }),
  setEditorView: (editorView) => set({ editorView }),
  setPreviewScrollEl: (previewScrollEl) => set({ previewScrollEl }),
  setTopLine: (topLine) => set({ topLine }),
  requestScrollToLine: (pendingScrollLine) => set({ pendingScrollLine }),
  clearPendingScroll: () => set({ pendingScrollLine: null }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
