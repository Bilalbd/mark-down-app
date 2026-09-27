import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore, resetPreviewZoom } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { countLines, countWords, formatCount, formatEncoding, formatEol } from '@/lib/textStats';
import './StatusBar.css';

export function StatusBar() {
  const hasDocument = useDocumentStore((s) => s.hasDocument);
  const content = useDocumentStore((s) => s.content);
  const encoding = useDocumentStore((s) => s.encoding);
  const eol = useDocumentStore((s) => s.eol);
  const loadId = useDocumentStore((s) => s.loadId);

  const viewMode = useSettingsStore((s) => s.viewMode);
  const statusBarVisible = useSettingsStore((s) => s.statusBarVisible);
  const previewZoom = useSettingsStore((s) => s.previewZoom);
  const set = useSettingsStore((s) => s.set);

  const cursor = useViewStore((s) => s.cursor);
  const selectionWords = useViewStore((s) => s.selectionWords);

  // Debounce lines and words computation by 300ms
  const [displayLines, setDisplayLines] = useState(() => countLines(content));
  const [displayWords, setDisplayWords] = useState(() => countWords(content));
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Recompute immediately when document loads (loadId changes)
    setDisplayLines(countLines(content));
    setDisplayWords(countWords(content));
  }, [loadId]);

  useEffect(() => {
    // Debounce updates for subsequent content changes
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      setDisplayLines(countLines(content));
      setDisplayWords(countWords(content));
      debounceTimerRef.current = null;
    }, 300);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content]);

  if (!hasDocument || !statusBarVisible) {
    return null;
  }

  const handleZoomClick = () => {
    set('previewZoom', resetPreviewZoom());
  };

  return (
    <div className="statusbar">
      <div className="statusbar__left">
        {viewMode !== 'formatted' && cursor && (
          <span className="statusbar__item">
            Ln {cursor.line}, Col {cursor.col}
          </span>
        )}
        <span className="statusbar__item">{formatCount(displayLines)} lines</span>
        {selectionWords !== null ? (
          <span className="statusbar__item">
            {formatCount(selectionWords)} of {formatCount(displayWords)} words
          </span>
        ) : (
          <span className="statusbar__item">{formatCount(displayWords)} words</span>
        )}
      </div>
      <div className="statusbar__right">
        <button className="statusbar__zoom" onClick={handleZoomClick} title="Reset zoom (Ctrl+0)">
          {Math.round(previewZoom * 100)}%
        </button>
        <span className="statusbar__item">{formatEncoding(encoding)}</span>
        <span className="statusbar__item">{formatEol(eol)}</span>
        <span className="statusbar__item">Markdown</span>
      </div>
    </div>
  );
}
