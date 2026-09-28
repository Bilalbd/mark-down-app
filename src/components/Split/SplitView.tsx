import { useCallback, useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { SourceEditor } from '@/components/Editor/SourceEditor';
import { Preview } from '@/components/Preview/Preview';
import {
  clamp,
  collectPreviewBlocks,
  innermostBlockIndex,
  lineForOffset,
  offsetForLine,
} from '@/lib/scrollSync';
import { resizeByKey } from '@/lib/resize';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import './SplitView.css';

const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;
/** After programmatically scrolling a pane, ignore its scroll events briefly. */
const ECHO_SUPPRESS_MS = 120;

export function SplitView() {
  const ratio = useSettingsStore((s) => s.splitRatio);
  const editorSide = useSettingsStore((s) => s.splitEditorSide);
  const set = useSettingsStore((s) => s.set);
  const persist = useSettingsStore((s) => s.persist);
  const containerRef = useRef<HTMLDivElement>(null);

  useScrollSync();
  useCursorMirror();

  const onDividerDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      set('splitRatio', clamp((ev.clientX - rect.left) / rect.width, MIN_RATIO, MAX_RATIO), {
        persist: false,
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing');
      persist('splitRatio');
    };
    document.body.classList.add('is-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onDividerKeyDown = (e: React.KeyboardEvent) => {
    // Read the live value: key repeat can fire again before React re-renders.
    const current = useSettingsStore.getState().splitRatio;
    const newRatio = resizeByKey(e.key, e.shiftKey, current, {
      min: MIN_RATIO,
      max: MAX_RATIO,
      step: 0.02,
    });
    if (newRatio !== null) {
      e.preventDefault();
      set('splitRatio', newRatio);
    }
  };

  return (
    <div className="split" ref={containerRef}>
      <div className="split__pane" style={{ flexBasis: `${ratio * 100}%` }}>
        {editorSide === 'left' ? <SourceEditor /> : <Preview />}
      </div>
      <div
        className="split__divider"
        onMouseDown={onDividerDown}
        onKeyDown={onDividerKeyDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        tabIndex={0}
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={Math.round(ratio * 100)}
      />
      <div className="split__pane split__pane--grow">
        {editorSide === 'left' ? <Preview /> : <SourceEditor />}
      </div>
    </div>
  );
}

/** Keeps the editor and preview scrolled to the same fractional source line. */
function useScrollSync() {
  const editorView = useViewStore((s) => s.editorView);
  const previewEl = useViewStore((s) => s.previewScrollEl);

  useEffect(() => {
    if (!editorView || !previewEl) return;
    const scroller = editorView.scrollDOM;
    let suppressEditorUntil = 0;
    let suppressPreviewUntil = 0;
    let raf = 0;

    const previewRoot = () => previewEl.querySelector<HTMLElement>('.preview');

    const syncPreviewToEditor = () => {
      const root = previewRoot();
      if (!root) return;
      const line = editorLineAt(editorView, scroller.scrollTop);
      const target = offsetForLine(collectPreviewBlocks(root), line) - 8;
      if (Math.abs(previewEl.scrollTop - target) < 1) return;
      suppressPreviewUntil = performance.now() + ECHO_SUPPRESS_MS;
      previewEl.scrollTop = target;
    };

    const syncEditorToPreview = () => {
      const root = previewRoot();
      if (!root) return;
      const line = lineForOffset(collectPreviewBlocks(root), previewEl.scrollTop + 8);
      const target = editorOffsetFor(editorView, line);
      if (Math.abs(scroller.scrollTop - target) < 1) return;
      suppressEditorUntil = performance.now() + ECHO_SUPPRESS_MS;
      scroller.scrollTop = target;
    };

    const onEditorScroll = () => {
      if (performance.now() < suppressEditorUntil) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncPreviewToEditor);
    };
    const onPreviewScroll = () => {
      if (performance.now() < suppressPreviewUntil) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncEditorToPreview);
    };

    scroller.addEventListener('scroll', onEditorScroll, { passive: true });
    previewEl.addEventListener('scroll', onPreviewScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onEditorScroll);
      previewEl.removeEventListener('scroll', onPreviewScroll);
    };
  }, [editorView, previewEl]);
}

/** Fractional 0-based line at a vertical offset in the editor's scroll space. */
function editorLineAt(view: EditorView, offset: number): number {
  const block = view.lineBlockAtHeight(offset);
  const lineNo = view.state.doc.lineAt(block.from).number - 1;
  const f = block.height > 0 ? clamp((offset - block.top) / block.height, 0, 1) : 0;
  return lineNo + f;
}

/** Editor scroll offset for a fractional 0-based line. */
function editorOffsetFor(view: EditorView, line: number): number {
  const lines = view.state.doc.lines;
  const whole = clamp(Math.floor(line), 0, lines - 1);
  const f = line - Math.floor(line);
  const block = view.lineBlockAt(view.state.doc.line(whole + 1).from);
  return block.top + block.height * f;
}

/**
 * Applies the `is-cursor-block` class to the block containing the editor cursor in split view.
 * Does nothing (no DOM reads or writes) unless the Split cursor highlight setting is on.
 */
export function useCursorMirror() {
  const enabled = useSettingsStore((s) => s.splitCursorMirror);
  const cursor = useViewStore((s) => s.cursor);
  const previewVersion = useViewStore((s) => s.previewVersion);
  const previewEl = useViewStore((s) => s.previewScrollEl);

  const cacheRef = useRef<{
    version: number;
    ranges: { start: number; end: number }[];
    elements: HTMLElement[];
  } | null>(null);
  const prevElementRef = useRef<HTMLElement | null>(null);
  const prevTableRef = useRef<HTMLElement | null>(null);

  /** Removes the tint (and the table's clip override) from wherever it was last applied. */
  const clearMarks = useCallback(() => {
    prevElementRef.current?.classList.remove('is-cursor-block');
    prevTableRef.current?.classList.remove('is-cursor-table');
    prevElementRef.current = null;
    prevTableRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!previewEl || !cursor) {
      clearMarks();
      return;
    }

    const raf = requestAnimationFrame(() => {
      const root = previewEl.querySelector<HTMLElement>('.preview');
      if (!root) return;

      // Get or cache the block ranges and elements for this preview version.
      if (!cacheRef.current || cacheRef.current.version !== previewVersion) {
        const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-line]'));
        const ranges = elements.map((el) => ({
          start: Number(el.dataset.line),
          end: el.dataset.lineEnd ? Number(el.dataset.lineEnd) : Number(el.dataset.line) + 1,
        }));
        cacheRef.current = { version: previewVersion, ranges, elements };
      }

      const cached = cacheRef.current;

      // Convert 1-based cursor line to 0-based for comparison with data-line.
      const lineIndex = cursor.line - 1;
      const blockIdx = innermostBlockIndex(cached.ranges, lineIndex);

      // Apply to the new block.
      let newElement: HTMLElement | null = null;
      if (blockIdx >= 0 && blockIdx < cached.elements.length) {
        newElement = cached.elements[blockIdx];
      }

      // A table row's band only reaches the pane's edges if its (scrolling) table may paint
      // outside itself, which is only safe when the table has nothing to scroll.
      const table = newElement?.closest<HTMLElement>('table') ?? null;
      const newTable = table && table.scrollWidth <= table.clientWidth ? table : null;

      // Only remove the classes from the previous elements if they differ from the new ones.
      if (prevElementRef.current !== newElement) {
        prevElementRef.current?.classList.remove('is-cursor-block');
      }
      if (prevTableRef.current !== newTable) {
        prevTableRef.current?.classList.remove('is-cursor-table');
      }

      newElement?.classList.add('is-cursor-block');
      newTable?.classList.add('is-cursor-table');

      prevElementRef.current = newElement;
      prevTableRef.current = newTable;
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [enabled, cursor, previewVersion, previewEl, clearMarks]);

  // Turning the setting off clears the tint straight away.
  useEffect(() => {
    if (!enabled) clearMarks();
  }, [enabled, clearMarks]);

  // Clean up when leaving Split view.
  useEffect(() => clearMarks, [clearMarks]);
}
