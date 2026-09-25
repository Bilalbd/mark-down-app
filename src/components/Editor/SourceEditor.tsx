import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment, Transaction, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightSpecialChars,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { cacheEditorState, cachedEditorState } from '@/lib/editorCache';
import { editorHighlighting, editorTheme } from './editorTheme';
import './SourceEditor.css';

const gutterCompartment = new Compartment();

/** Returns the 0-based document line at the top of the editor viewport. */
function topVisibleLine(view: EditorView): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 12);
  return view.state.doc.lineAt(block.from).number - 1;
}

function buildExtensions(): Extension[] {
  const lineNumbersOn = useSettingsStore.getState().editorLineNumbers;
  return [
    gutterCompartment.of(lineNumbersOn ? [lineNumbers(), highlightActiveLineGutter()] : []),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    // The app has its own find bar; CM only paints match decorations while a panel is
    // open, so register an invisible one that FindBar opens/closes.
    search({ top: true, createPanel: () => ({ dom: hiddenPanel(), top: true }) }),
    EditorView.lineWrapping,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap.filter((b) => b.key !== 'Mod-f'),
      indentWithTab,
    ]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    editorTheme,
    editorHighlighting,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) useDocumentStore.getState().setContent(u.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      scroll: (_e, v) => {
        useViewStore.getState().setTopLine(topVisibleLine(v));
      },
    }),
  ];
}

function createEditorState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: buildExtensions() });
}

export function SourceEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const content = useDocumentStore((s) => s.content);
  const loadId = useDocumentStore((s) => s.loadId);
  const path = useDocumentStore((s) => s.path);
  const lineNumbersOn = useSettingsStore((s) => s.editorLineNumbers);
  const fontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorView = useViewStore((s) => s.setEditorView);
  const pendingScrollLine = useViewStore((s) => s.pendingScrollLine);
  const clearPendingScroll = useViewStore((s) => s.clearPendingScroll);

  // Snapshots, not a "first run" flag: comparing against a value already initialised
  // to the current prop makes this naturally idempotent under React StrictMode's
  // dev-only double-invoke of effects (a stale-flag pattern would instead see the
  // second invoke as "not the first run" and wrongly reset a just-mounted editor).
  const prevLoadIdRef = useRef(loadId);
  const prevPathRef = useRef(path);

  // Create the editor once, reusing the cached state (undo history included) per document
  // load when it still matches the current content. Each tab gets its own editor state via
  // per-load caching.
  useEffect(() => {
    const host = hostRef.current!;
    const docState = useDocumentStore.getState();
    const state =
      cachedEditorState(docState.loadId, docState.content) ?? createEditorState(docState.content);
    const view = new EditorView({ parent: host, state });
    viewRef.current = view;
    setEditorView(view);
    view.focus();

    // Restore the position the other view was at.
    const initial = useViewStore.getState().topLine;
    if (initial > 0) scrollToLine(view, initial);

    return () => {
      cacheEditorState(prevLoadIdRef.current, view.state);
      setEditorView(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // On load change: cache outgoing state, restore from cache if available, or create fresh.
  // Fresh loads get new undo history; same-path reloads keep scroll; different paths lose scroll.
  useEffect(() => {
    if (loadId === prevLoadIdRef.current) return; // just mounted/remounted, no new load
    const outgoingLoadId = prevLoadIdRef.current;
    prevLoadIdRef.current = loadId;
    const view = viewRef.current;
    if (!view) return;

    cacheEditorState(outgoingLoadId, view.state);

    const content = useDocumentStore.getState().content;
    const restored = cachedEditorState(loadId, content);

    if (restored) {
      view.setState(restored);
    } else {
      const samePath = prevPathRef.current === path;
      const savedLine = samePath ? topVisibleLine(view) : null;
      view.setState(createEditorState(content));
      if (savedLine !== null) scrollToLine(view, savedLine);
    }

    prevPathRef.current = path;
  }, [loadId, path]);

  // Fallback sync for content changes that didn't come from a load (shouldn't normally
  // happen, since edits flow the other way, but keeps the view from drifting if they do).
  // Not added to history: it isn't a user edit.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterCompartment.reconfigure(
        lineNumbersOn ? [lineNumbers(), highlightActiveLineGutter()] : [],
      ),
    });
  }, [lineNumbersOn]);

  // Outline click / cross-view scroll request.
  useEffect(() => {
    if (pendingScrollLine === null || !viewRef.current) return;
    scrollToLine(viewRef.current, pendingScrollLine);
    clearPendingScroll();
  }, [pendingScrollLine, clearPendingScroll]);

  return (
    <div
      className="source-editor"
      ref={hostRef}
      style={{ '--editor-font-size': `${fontSize}px` } as React.CSSProperties}
    />
  );
}

function hiddenPanel(): HTMLElement {
  const dom = document.createElement('div');
  dom.style.display = 'none';
  return dom;
}

export function scrollToLine(view: EditorView, line0: number): void {
  const lineNo = Math.min(Math.max(line0 + 1, 1), view.state.doc.lines);
  const pos = view.state.doc.line(lineNo).from;
  view.dispatch({
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 8 }),
  });
}
