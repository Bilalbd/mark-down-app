import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
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
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { editorHighlighting, editorTheme } from './editorTheme';
import './SourceEditor.css';

const gutterCompartment = new Compartment();

/** Returns the 0-based document line at the top of the editor viewport. */
function topVisibleLine(view: EditorView): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 12);
  return view.state.doc.lineAt(block.from).number - 1;
}

export function SourceEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const content = useDocumentStore((s) => s.content);
  const setContent = useDocumentStore((s) => s.setContent);
  const lineNumbersOn = useSettingsStore((s) => s.editorLineNumbers);
  const fontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorView = useViewStore((s) => s.setEditorView);
  const setTopLine = useViewStore((s) => s.setTopLine);
  const pendingScrollLine = useViewStore((s) => s.pendingScrollLine);
  const clearPendingScroll = useViewStore((s) => s.clearPendingScroll);

  // Create the editor once.
  useEffect(() => {
    const host = hostRef.current!;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: useDocumentStore.getState().content,
        extensions: [
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
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          editorTheme,
          editorHighlighting,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setContent(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            scroll: (_e, v) => {
              setTopLine(topVisibleLine(v));
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    setEditorView(view);

    // Restore the position the other view was at.
    const initial = useViewStore.getState().topLine;
    if (initial > 0) scrollToLine(view, initial);

    return () => {
      setEditorView(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // External content changes (file reload, opening another file) → replace the doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
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

export function scrollToLine(view: EditorView, line0: number): void {
  const lineNo = Math.min(Math.max(line0 + 1, 1), view.state.doc.lines);
  const pos = view.state.doc.line(lineNo).from;
  view.dispatch({
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 8 }),
  });
}
