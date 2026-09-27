import React, { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { renderMarkdown, headingLine } from '@/markdown/render';
import { renderMermaidBlocks } from '@/markdown/mermaid';
import { useResolvedTheme } from '@/lib/useAppTheme';
import { classifyLink } from '@/lib/links';
import { dirname, isTauri, toAssetUrl, openExternal, revealInExplorer } from '@/lib/tauri';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore, isPreviewFullWidth } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { openPath } from '@/store/tabs';
import { samePath } from '@/lib/tabs';
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
  const loadId = useDocumentStore((s) => s.loadId);
  const zoom = useSettingsStore((s) => s.previewZoom);
  const blockRemoteImages = useSettingsStore((s) => s.blockRemoteImages);
  const fullWidth = useSettingsStore((s) => isPreviewFullWidth(s));
  const setPreviewScrollEl = useViewStore((s) => s.setPreviewScrollEl);
  const setTopLine = useViewStore((s) => s.setTopLine);
  const pendingScrollLine = useViewStore((s) => s.pendingScrollLine);
  const clearPendingScroll = useViewStore((s) => s.clearPendingScroll);
  const bumpPreviewVersion = useViewStore((s) => s.bumpPreviewVersion);

  const [html, setHtml] = useState<{ html: string; loadId: number }>({ html: '', loadId: -1 });
  const theme = useResolvedTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);
  const renderedLoadIdRef = useRef(-1);
  const restoredLoadIdRef = useRef(-1);

  useEffect(() => {
    setPreviewScrollEl(scrollRef.current);
    return () => setPreviewScrollEl(null);
  }, [setPreviewScrollEl]);

  useEffect(() => {
    const seq = ++renderSeq.current;
    const isNewLoad = loadId !== renderedLoadIdRef.current;
    const timer = setTimeout(
      async () => {
        const result = await renderMarkdown(content, {
          baseDir: path ? dirname(path) : undefined,
          toAssetUrl: isTauri() ? toAssetUrl : undefined,
          blockRemoteImages,
        });
        if (seq !== renderSeq.current) return; // a newer render superseded this one
        renderedLoadIdRef.current = loadId;
        setHtml({ html: result.html, loadId });
        useViewStore.getState().setHeadings(result.headings);
      },
      isNewLoad ? 0 : RENDER_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [content, path, loadId, blockRemoteImages]);

  useLayoutEffect(() => {
    if (html.html) bumpPreviewVersion();
  }, [html.html, bumpPreviewVersion]);

  // Mermaid diagrams render client-side after the HTML is in the DOM (and again on theme change).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !html.html.includes('mermaid-block')) return;
    void renderMermaidBlocks(root, theme);
  }, [html.html, theme]);

  // After the first paint of real content, restore the position the other view was at.
  useLayoutEffect(() => {
    if (!html.html || !scrollRef.current) return;
    // Only restore once per load: check HTML is for current loadId and hasn't been restored yet
    if (html.loadId === loadId && restoredLoadIdRef.current !== loadId) {
      restoredLoadIdRef.current = loadId;
      const line = useViewStore.getState().topLine;
      if (line > 0) scrollPreviewToLine(scrollRef.current, line);
    }
  }, [html.html, loadId]);

  // Outline click / cross-view scroll request. Only run once HTML for the current loadId is rendered.
  useEffect(() => {
    if (pendingScrollLine === null || !scrollRef.current || !html.html) return;
    if (html.loadId !== loadId) return; // HTML is for a different load
    scrollPreviewToLine(scrollRef.current, pendingScrollLine);
    clearPendingScroll();
  }, [pendingScrollLine, clearPendingScroll, html.html, loadId]);

  const onScroll = () => {
    if (scrollRef.current) setTopLine(lineAtTop(scrollRef.current));
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (href === null) return;
    e.preventDefault();

    const classification = classifyLink(href, path);
    switch (classification.kind) {
      case 'anchor':
        scrollRef.current
          ?.querySelector<HTMLElement>(`[id="${CSS.escape(classification.id)}"]`)
          ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      case 'external':
        void openExternal(href).catch(() => undefined);
        return;
      case 'markdown':
        void openPath(classification.path)
          .then((ok) => {
            if (ok && classification.anchor) {
              const docPath = useDocumentStore.getState().path;
              if (docPath && samePath(classification.path, docPath)) {
                const line = headingLine(
                  useDocumentStore.getState().content,
                  classification.anchor,
                );
                if (line !== null) {
                  useViewStore.getState().requestScrollToLine(line);
                }
              }
            }
          })
          .catch(() => undefined);
        return;
      case 'file':
        void revealInExplorer(classification.path).catch(() => undefined);
        return;
      case 'ignore':
        return;
    }
  };

  // Middle-click would otherwise let the webview open a new window on the raw href.
  const onAuxClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a')) e.preventDefault();
  };

  return (
    <div className="preview-scroll" ref={scrollRef} onScroll={onScroll}>
      <article
        className={`preview${fullWidth ? ' preview--full' : ''}`}
        style={{ '--md-zoom': zoom } as React.CSSProperties}
        onClick={onClick}
        onAuxClick={onAuxClick}
        dangerouslySetInnerHTML={{ __html: html.html }}
      />
    </div>
  );
}
