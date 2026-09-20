import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { renderMarkdown } from '@/markdown/render';
import type { HeadingInfo } from '@/markdown/plugins';
import { dirname, isTauri, toAssetUrl } from '@/lib/tauri';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import './Preview.css';

interface Props {
  onHeadings?: (headings: HeadingInfo[]) => void;
}

const RENDER_DEBOUNCE_MS = 150;

export function Preview({ onHeadings }: Props) {
  const content = useDocumentStore((s) => s.content);
  const path = useDocumentStore((s) => s.path);
  const zoom = useSettingsStore((s) => s.previewZoom);
  const [html, setHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const renderSeq = useRef(0);

  useEffect(() => {
    const seq = ++renderSeq.current;
    const timer = setTimeout(async () => {
      const result = await renderMarkdown(content, {
        baseDir: path ? dirname(path) : undefined,
        toAssetUrl: isTauri() ? toAssetUrl : undefined,
      });
      if (seq !== renderSeq.current) return; // a newer render superseded this one
      setHtml(result.html);
      onHeadings?.(result.headings);
    }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, path, onHeadings]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      containerRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({
        block: 'start',
      });
      return;
    }
    if (/^(https?:|mailto:)/i.test(href)) {
      e.preventDefault();
      if (isTauri()) void openUrl(href);
      else window.open(href, '_blank', 'noopener');
    }
  };

  return (
    <div className="preview-scroll" ref={containerRef}>
      <article
        className="preview"
        style={{ zoom }}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
