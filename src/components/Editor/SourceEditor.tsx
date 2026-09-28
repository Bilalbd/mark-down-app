import React, { useEffect, useMemo, useRef } from 'react';
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
import { countWords } from '@/lib/textStats';
import { effectiveSpellLanguages } from '@/lib/spell';
import { spellLanguages as fetchSpellLanguages } from '@/lib/tauri';
import { editorHighlighting, editorTheme } from './editorTheme';
import { spellcheckExtension } from './spellcheck';
import './SourceEditor.css';

const gutterCompartment = new Compartment();
const spellCompartment = new Compartment();

/** The current spell-check extension for the compartment above: `[]` when it's off or has no
 * effective language (unticking every language means "no squiggles", not "check nothing"). */
function currentSpellExtension(): Extension {
  const spellOn = useSettingsStore.getState().spellCheck;
  if (!spellOn) return [];
  const { spellLanguages, spellWords } = useSettingsStore.getState();
  const supported = useViewStore.getState().spellSupportedLanguages;
  const effectiveLanguages = effectiveSpellLanguages(spellLanguages, supported, navigator.language);
  return effectiveLanguages.length > 0 ? spellcheckExtension(effectiveLanguages, spellWords) : [];
}

let lastEmitted: string | null = null;
let pendingCursorUpdate: number | null = null;

/** Returns the 0-based document line at the top of the editor viewport. */
function topVisibleLine(view: EditorView): number {
  const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 12);
  return view.state.doc.lineAt(block.from).number - 1;
}

/** Updates the view store with cursor position and selection word count. */
function updateCursorState(editorView: EditorView): void {
  const mainSelection = editorView.state.selection.main;
  const headPos = mainSelection.head;
  const line = editorView.state.doc.lineAt(headPos);
  const col = headPos - line.from + 1;
  useViewStore.getState().setCursor({ line: line.number, col });

  // Count words in selection if not empty
  const selectedText =
    mainSelection.from === mainSelection.to
      ? ''
      : editorView.state.doc.sliceString(mainSelection.from, mainSelection.to);
  const words = selectedText ? countWords(selectedText) : null;
  useViewStore.getState().setSelectionWords(words);
}

/** Determines whether external content changes need to be synced to the editor.
 * Returns false without calling readDoc when content matches the last emitted string,
 * otherwise reads the current doc and compares. */
export function needsExternalSync(
  content: string,
  lastEmitted: string | null,
  readDoc: () => string,
): boolean {
  if (content === lastEmitted) return false;
  return readDoc() !== content;
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
    spellCompartment.of(currentSpellExtension()),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const str = u.state.doc.toString();
        lastEmitted = str;
        useDocumentStore.getState().setContent(str);
      }

      // Schedule cursor/selection update on the next animation frame, cancelling any pending one
      if (u.selectionSet || u.docChanged) {
        if (pendingCursorUpdate !== null) {
          cancelAnimationFrame(pendingCursorUpdate);
        }
        // Capture the view in a closure to use in rAF
        const editorView = u.view;
        pendingCursorUpdate = requestAnimationFrame(() => {
          updateCursorState(editorView);
          pendingCursorUpdate = null;
        });
      }
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
  const spellCheckOn = useSettingsStore((s) => s.spellCheck);
  const spellLanguagesSetting = useSettingsStore((s) => s.spellLanguages);
  const spellWords = useSettingsStore((s) => s.spellWords);
  const supportedLanguages = useViewStore((s) => s.spellSupportedLanguages);
  const setSpellSupportedLanguages = useViewStore((s) => s.setSpellSupportedLanguages);
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
    lastEmitted = null;
    const host = hostRef.current!;
    const docState = useDocumentStore.getState();
    const state =
      cachedEditorState(docState.loadId, docState.content) ?? createEditorState(docState.content);
    const view = new EditorView({ parent: host, state });
    viewRef.current = view;
    setEditorView(view);
    view.focus();

    // Set cursor from initial selection
    updateCursorState(view);

    // Restore the position the other view was at.
    const initial = useViewStore.getState().topLine;
    if (initial > 0) scrollToLine(view, initial);

    return () => {
      if (pendingCursorUpdate !== null) {
        cancelAnimationFrame(pendingCursorUpdate);
        pendingCursorUpdate = null;
      }
      cacheEditorState(prevLoadIdRef.current, view.state);
      useViewStore.getState().setCursor(null);
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
    lastEmitted = null;
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

    // setState() doesn't fire the update listener (unlike dispatch()), so the view store's
    // cursor would otherwise keep the outgoing document's position - stale, and potentially
    // past the end of the incoming document (status bar, and Split view's cursor mirror).
    updateCursorState(view);

    // A restored cached state carries whatever spellCompartment content was live the last time
    // this tab was active, which can be stale (spellCheck, the languages or the personal
    // dictionary may have changed while this tab was in the background - see currentSpellExtension).
    // Reconfigure against the current settings unconditionally so a background tab's squiggles
    // are correct the moment it's switched back to, not just on its next settings change.
    view.dispatch({ effects: spellCompartment.reconfigure(currentSpellExtension()) });

    prevPathRef.current = path;
  }, [loadId, path]);

  // Fallback sync for content changes that didn't come from a load (shouldn't normally
  // happen, since edits flow the other way, but keeps the view from drifting if they do).
  // Not added to history: it isn't a user edit.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!needsExternalSync(content, lastEmitted, () => view.state.doc.toString())) return;
    const current = view.state.doc.toString();
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

  // Windows' installed spelling dictionaries, fetched once and shared with Settings. Failure
  // just means "no automatic language yet" - spell check is a hint, not an error to surface.
  useEffect(() => {
    let cancelled = false;
    void fetchSpellLanguages()
      .then((langs) => {
        if (!cancelled) setSpellSupportedLanguages(langs);
      })
      .catch(() => undefined); // spell check is a hint - failure just means no automatic pick yet
    return () => {
      cancelled = true;
    };
  }, [setSpellSupportedLanguages]);

  const effectiveSpellLangs = useMemo(
    () =>
      spellCheckOn
        ? effectiveSpellLanguages(spellLanguagesSetting, supportedLanguages, navigator.language)
        : [],
    [spellCheckOn, spellLanguagesSetting, supportedLanguages],
  );

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: spellCompartment.reconfigure(
        effectiveSpellLangs.length > 0 ? spellcheckExtension(effectiveSpellLangs, spellWords) : [],
      ),
    });
  }, [effectiveSpellLangs, spellWords]);

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
