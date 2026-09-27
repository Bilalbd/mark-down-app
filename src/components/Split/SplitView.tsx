import { useEffect, useRef } from 'react';
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

/** Applies `is-cursor-block` class to the block containing the editor cursor in split view. */
function useCursorMirror() {
  const cursor = useViewStore((s) => s.cursor);
  const previewVersion = useViewStore((s) => s.previewVersion);
  const previewEl = useViewStore((s) => s.previewScrollEl);

  const cacheRef = useRef<
    Map<number, { ranges: { start: number; end: number }[]; elements: HTMLElement[] }>
  >(new Map());
  const prevElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!previewEl || !cursor) {
      if (prevElementRef.current) {
        prevElementRef.current.classList.remove('is-cursor-block');
        prevElementRef.current = null;
      }
      return;
    }

    const raf = requestAnimationFrame(() => {
      const root = previewEl.querySelector<HTMLElement>('.preview');
      if (!root) return;

      // Get or cache the block ranges and elements for this preview version.
      let cached = cacheRef.current.get(previewVersion);
      if (!cached) {
        const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-line]'));
        const ranges = elements.map((el) => ({
          start: Number(el.dataset.line),
          end: el.dataset.lineEnd ? Number(el.dataset.lineEnd) : Number(el.dataset.line) + 1,
        }));
        cached = { ranges, elements };
        cacheRef.current.set(previewVersion, cached);
      }

      // Convert 1-based cursor line to 0-based for comparison with data-line.
      const lineIndex = cursor.line - 1;
      const blockIdx = innermostBlockIndex(cached.ranges, lineIndex);

      // Clear the previous block.
      if (prevElementRef.current) {
        prevElementRef.current.classList.remove('is-cursor-block');
      }

      // Apply to the new block.
      if (blockIdx >= 0 && blockIdx < cached.elements.length) {
        const el = cached.elements[blockIdx];
        prevElementRef.current = el;
        el.classList.add('is-cursor-block');
      } else {
        prevElementRef.current = null;
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      // On unmount (leaving Split view), remove the class.
      if (prevElementRef.current) {
        prevElementRef.current.classList.remove('is-cursor-block');
      }
    };
  }, [cursor, previewVersion, previewEl]);
}
