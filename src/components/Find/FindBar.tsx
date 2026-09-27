import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  openSearchPanel,
  setSearchQuery,
} from '@codemirror/search';
import {
  clearPreviewHighlights,
  findInPreview,
  matchIndexAfterSearch,
  setCurrentPreviewMatch,
  type PreviewMatch,
} from '@/lib/previewFind';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import './FindBar.css';

export function FindBar() {
  const open = useViewStore((s) => s.findOpen);
  const setOpen = useViewStore((s) => s.setFindOpen);
  const editorView = useViewStore((s) => s.editorView);
  const previewEl = useViewStore((s) => s.previewScrollEl);
  const previewVersion = useViewStore((s) => s.previewVersion);
  const viewMode = useSettingsStore((s) => s.viewMode);
  const content = useDocumentStore((s) => s.content);

  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<PreviewMatch[]>([]);
  const [index, setIndex] = useState(0);
  const [editorCount, setEditorCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef(0);
  const lastKeyRef = useRef('');

  const usePreview = viewMode !== 'source';

  // Mirror index to indexRef on each render.
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Focus and select the input whenever the bar opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
      if (editorView) openSearchPanel(editorView);
    } else {
      clearPreviewHighlights();
      lastKeyRef.current = '';
      if (editorView) {
        editorView.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
        closeSearchPanel(editorView);
      }
    }
  }, [open, editorView]);

  // Run the search when the query, options, view or document changes.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (editorView) {
        openSearchPanel(editorView);
        const q = new SearchQuery({ search: query, caseSensitive });
        editorView.dispatch({ effects: setSearchQuery.of(q) });
        let n = 0;
        if (query) {
          const cursor = q.getCursor(editorView.state);
          while (!cursor.next().done) n++;
        }
        setEditorCount(n);
      }
      if (usePreview && previewEl) {
        const root = previewEl.querySelector<HTMLElement>('.preview');
        const found = root ? findInPreview(root, query, caseSensitive) : [];
        const key = `${query}\u0000${caseSensitive}\u0000${usePreview}`;
        const searchChanged = key !== lastKeyRef.current;
        lastKeyRef.current = key;
        const next = matchIndexAfterSearch(indexRef.current, searchChanged, found.length);
        setMatches(found);
        setIndex(next);
        setCurrentPreviewMatch(found, next, { scroll: searchChanged });
      } else {
        clearPreviewHighlights();
        setMatches([]);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [open, query, caseSensitive, usePreview, previewEl, previewVersion, editorView, content]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (usePreview) {
        if (matches.length === 0) return;
        const next = (index + dir + matches.length) % matches.length;
        setIndex(next);
        indexRef.current = next;
        setCurrentPreviewMatch(matches, next, { scroll: true });
      } else if (editorView) {
        (dir === 1 ? findNext : findPrevious)(editorView);
      }
    },
    [usePreview, matches, index, editorView],
  );

  if (!open) return null;

  const total = usePreview ? matches.length : editorCount;
  const counter = !query
    ? ''
    : total === 0
      ? 'No results'
      : usePreview
        ? `${index + 1} of ${total}`
        : `${total} found`;

  return (
    <div className="findbar" role="search">
      <input
        ref={inputRef}
        className="findbar__input"
        placeholder="Find"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
          }
        }}
        spellCheck={false}
      />
      <span className={`findbar__count ${total === 0 && query ? 'is-empty' : ''}`}>{counter}</span>
      <button
        className={`findbar__btn ${caseSensitive ? 'is-active' : ''}`}
        title="Match case"
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button className="findbar__btn" title="Previous (Shift+Enter)" onClick={() => step(-1)}>
        <ChevronUp size={14} strokeWidth={1.75} absoluteStrokeWidth />
      </button>
      <button className="findbar__btn" title="Next (Enter)" onClick={() => step(1)}>
        <ChevronDown size={14} strokeWidth={1.75} absoluteStrokeWidth />
      </button>
      <button className="findbar__btn" title="Close (Esc)" onClick={() => setOpen(false)}>
        <X size={14} strokeWidth={1.75} absoluteStrokeWidth />
      </button>
    </div>
  );
}
