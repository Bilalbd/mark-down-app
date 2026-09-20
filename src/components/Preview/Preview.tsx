import React, { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { renderMarkdown } from '@/markdown/render';
import { renderMermaidBlocks } from '@/markdown/mermaid';
import { useResolvedTheme } from '@/lib/useAppTheme';
import { dirname, isTauri, toAssetUrl } from '@/lib/tauri';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import './Preview.css';

const RENDER_DEBOUNCE_MS = 150;

/** Block elements carrying source-line info, in document order. */
function lineBlocks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-line]'));
}

/** 0-based source line of the block at the top of the scroll viewport. */
export function lineAtTop(scrollEl: HTMLElement): number {
  // Tolerance covers the 8px margin used when scrolling a block to the top.
  const top = scrollEl.scrollTop + 12;
  let best = 0;
  for (const el of lineBlocks(scrollEl)) {
    if (el.offsetTop <= top) best = Number(el.dataset.line);
    else break;
  }
  return best;
}

/** Scroll so the first block starting at or after `line` sits at the top. */
export function scrollPreviewToLine(scrollEl: HTMLElement, line: number, smooth = false): void {
  const blocks = lineBlocks(scrollEl);
  const target = blocks.find((el) => Number(el.dataset.line) >= line) ?? blocks.at(-1);
  if (!target) return;
  scrollEl.scrollTo({ top: target.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' });
}

export function Preview() {
  const content = useDocumentStore((s) => s.content);
  const path = useDocumentStore((s) => s.path);
  const zoom = useSettingsStore((s) => s.previewZoom);
  const setPreviewScrollEl = useViewStore((s) => s.setPreviewScrollEl);
  const setTopLine = useViewStore((s) => s.setTopLine);
  const pendingScrollLine = useViewStore((s) => s.pendingScrollLine);
  const clearPendingScroll = useViewStore((s) => s.clearPendingScroll);
  const bumpPreviewVersion = useViewStore((s) => s.bumpPreviewVersion);

  const [html, setHtml] = useState('');
  const theme = useResolvedTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);
  const restoredRef = useRef(false);

  useEffect(() => {
    setPreviewScrollEl(scrollRef.current);
    return () => setPreviewScrollEl(null);
  }, [setPreviewScrollEl]);

  useEffect(() => {
    const seq = ++renderSeq.current;
    const timer = setTimeout(async () => {
      const result = await renderMarkdown(content, {
        baseDir: path ? dirname(path) : undefined,
        toAssetUrl: isTauri() ? toAssetUrl : undefined,
      });
      if (seq !== renderSeq.current) return; // a newer render superseded this one
      setHtml(result.html);
    }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, path]);

  useLayoutEffect(() => {
    if (html) bumpPreviewVersion();
  }, [html, bumpPreviewVersion]);

  // Mermaid diagrams render client-side after the HTML is in the DOM (and again on theme change).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !html.includes('mermaid-block')) return;
    void renderMermaidBlocks(root, theme);
  }, [html, theme]);

  // After the first paint of real content, restore the position the other view was at.
  useLayoutEffect(() => {
    if (!html || restoredRef.current || !scrollRef.current) return;
    restoredRef.current = true;
    const line = useViewStore.getState().topLine;
    if (line > 0) scrollPreviewToLine(scrollRef.current, line);
  }, [html]);

  // Outline click / cross-view scroll request.
  useEffect(() => {
    if (pendingScrollLine === null || !scrollRef.current || !html) return;
    scrollPreviewToLine(scrollRef.current, pendingScrollLine);
    clearPendingScroll();
  }, [pendingScrollLine, clearPendingScroll, html]);

  const onScroll = () => {
    if (scrollRef.current) setTopLine(lineAtTop(scrollRef.current));
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      scrollRef.current
        ?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (/^(https?:|mailto:)/i.test(href)) {
      e.preventDefault();
      if (isTauri()) void openUrl(href);
      else window.open(href, '_blank', 'noopener');
    }
  };

  return (
    <div className="preview-scroll" ref={scrollRef} onScroll={onScroll}>
      <article
        className="preview"
        style={{ '--md-zoom': zoom } as React.CSSProperties}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
