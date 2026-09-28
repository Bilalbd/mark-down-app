import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EditorState,
  Compartment,
  Prec,
  Transaction,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
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
  type KeyBinding,
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
import {
  insertHorizontalRule,
  insertLink,
  setHeading,
  toggleBold,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleList,
  toggleQuote,
  toggleStrikethrough,
} from '@/lib/formatting';
import { buildEditorMenu } from '@/lib/editorMenu';
import { ContextMenu, findMenuItem, type MenuEntry } from '@/components/ContextMenu/ContextMenu';
import { effectiveSpellLanguages } from '@/lib/spell';
import {
  readClipboardText,
  spellLanguages as fetchSpellLanguages,
  spellSuggest,
  writeClipboardText,
} from '@/lib/tauri';
import { editorHighlighting, editorTheme } from './editorTheme';
import { misspellingAt, spellcheckExtension } from './spellcheck';
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

interface EditorMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
  /** The misspelling the menu was built for, so its suggestions/Add/Ignore items know which
   * word and range to act on. `null` when the click landed on correctly-spelled text. */
  misspelling: { from: number; to: number; word: string } | null;
}

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

/** Runs a formatting command from `lib/formatting` as a key binding. */
function formatCommand(command: (state: EditorState) => TransactionSpec | null) {
  return (view: EditorView): boolean => {
    const spec = command(view.state);
    if (!spec) return false;
    view.dispatch(spec);
    return true;
  };
}

/** Formatting shortcuts, above the default keymap (Ctrl+I replaces "select parent syntax").
 * Headings use Ctrl+Shift+digit, not Ctrl+Alt+digit: on Windows Ctrl+Alt is AltGr, which many
 * keyboard layouts need for typing `{ [ ] }`. Ctrl+digit is taken by tab switching and zoom.
 * There's no Ctrl+Shift+0 for Paragraph: Windows registers it as an input-language hotkey, and
 * a real press left the page unresponsive. Pressing a heading's own shortcut again toggles it off. */
const formattingKeymap: KeyBinding[] = [
  { key: 'Mod-b', run: formatCommand(toggleBold) },
  { key: 'Mod-i', run: formatCommand(toggleItalic) },
  { key: 'Mod-k', run: formatCommand(insertLink) },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    key: `Mod-Shift-${level}`,
    run: formatCommand((state) => setHeading(state, level)),
  })),
];

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
    Prec.high(keymap.of(formattingKeymap)),
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

  const [menu, setMenu] = useState<EditorMenuState | null>(null);
  const menuSeqRef = useRef(0);

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
  // Read from the menu-opening handler below, which isn't a React render and so can't close
  // over the memoised value directly without going stale between renders.
  const effectiveSpellLangsRef = useRef(effectiveSpellLangs);
  useEffect(() => {
    effectiveSpellLangsRef.current = effectiveSpellLangs;
  }, [effectiveSpellLangs]);

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

  // A tab switch (or reload) invalidates any open menu's position and misspelling range.
  useEffect(() => {
    setMenu(null);
  }, [loadId]);

  // Builds the menu model for a click/cursor position and opens it - shared by the right-click
  // handler and the Menu-key/Shift+F10 handler below. Waits up to 150ms for spelling suggestions
  // (per CLAUDE.md's "rendering stays debounced and fast") rather than opening once, then
  // patching the suggestions in later.
  const openMenuAt = useCallback(async (view: EditorView, pos: number, x: number, y: number) => {
    const seq = ++menuSeqRef.current;
    const state = view.state;
    const hasSelection = !state.selection.main.empty;
    const misspelling = misspellingAt(state, pos);

    let suggestions: string[] = [];
    if (misspelling) {
      suggestions = await Promise.race([
        spellSuggest(misspelling.word, effectiveSpellLangsRef.current).catch(() => [] as string[]),
        new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 150)),
      ]);
    }
    if (menuSeqRef.current !== seq) return; // superseded by a newer open, or the menu was closed

    setMenu({
      x,
      y,
      misspelling,
      items: buildEditorMenu({
        misspelling: misspelling ? { word: misspelling.word } : null,
        suggestions,
        hasSelection,
      }),
    });
  }, []);

  // Right-click and keyboard (Menu key, Shift+F10) both open the same menu, at the pointer or
  // at the caret respectively. Native listeners on the host div, not a CodeMirror extension:
  // the menu is React-owned UI, not editor state, and this way it doesn't need rebuilding
  // whenever the extensions are (load changes, settings changes).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onContextMenu = (e: MouseEvent) => {
      const view = viewRef.current;
      if (!view) return;
      e.preventDefault();
      const pos =
        view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.head;
      const sel = view.state.selection.main;
      // Clicking inside the selection keeps it; clicking outside moves the cursor there first.
      if (sel.empty || pos < sel.from || pos > sel.to) {
        view.dispatch({ selection: { anchor: pos } });
      }
      void openMenuAt(view, pos, e.clientX, e.clientY);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
      const view = viewRef.current;
      if (!view) return;
      e.preventDefault();
      const pos = view.state.selection.main.head;
      const coords = view.coordsAtPos(pos);
      if (!coords) return;
      void openMenuAt(view, pos, coords.left, coords.bottom);
    };

    host.addEventListener('contextmenu', onContextMenu);
    host.addEventListener('keydown', onKeyDown);
    return () => {
      host.removeEventListener('contextmenu', onContextMenu);
      host.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuAt]);

  const handleMenuAction = (id: string) => {
    const view = viewRef.current;
    const current = menu;
    setMenu(null);
    if (!view) return;
    const misspelling = current?.misspelling ?? null;
    const item = current ? findMenuItem(current.items, id) : undefined;
    const finish = () => view.focus();

    if (id.startsWith('suggestion-') && item && misspelling) {
      view.dispatch({
        changes: { from: misspelling.from, to: misspelling.to, insert: item.label },
        selection: { anchor: misspelling.from + item.label.length },
        scrollIntoView: true,
      });
      finish();
      return;
    }

    switch (id) {
      case 'add-to-dictionary': {
        if (misspelling) {
          const { spellWords: words, set } = useSettingsStore.getState();
          if (!words.includes(misspelling.word)) set('spellWords', [...words, misspelling.word]);
        }
        finish();
        return;
      }
      case 'ignore': {
        if (misspelling) useViewStore.getState().ignoreWord(misspelling.word);
        finish();
        return;
      }
      case 'cut': {
        const sel = view.state.selection.main;
        if (sel.empty) {
          finish();
          return;
        }
        const text = view.state.sliceDoc(sel.from, sel.to);
        writeClipboardText(text)
          .then(() => view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } }))
          .catch(() => undefined) // clipboard write failed - leave the text in place
          .finally(finish);
        return;
      }
      case 'copy': {
        const sel = view.state.selection.main;
        if (sel.empty) {
          finish();
          return;
        }
        const text = view.state.sliceDoc(sel.from, sel.to);
        writeClipboardText(text)
          .catch(() => undefined)
          .finally(finish);
        return;
      }
      case 'paste': {
        readClipboardText()
          .then((text) => {
            if (text) view.dispatch(view.state.replaceSelection(text));
          })
          .catch(() => undefined) // no clipboard access - nothing to paste
          .finally(finish);
        return;
      }
      case 'select-all': {
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        finish();
        return;
      }
      case 'bold':
        formatCommand(toggleBold)(view);
        break;
      case 'italic':
        formatCommand(toggleItalic)(view);
        break;
      case 'strikethrough':
        formatCommand(toggleStrikethrough)(view);
        break;
      case 'inline-code':
        formatCommand(toggleInlineCode)(view);
        break;
      case 'link':
        formatCommand(insertLink)(view);
        break;
      case 'code-block':
        formatCommand(toggleCodeBlock)(view);
        break;
      case 'quote':
        formatCommand(toggleQuote)(view);
        break;
      case 'list-bullet':
        formatCommand((s) => toggleList(s, 'bullet'))(view);
        break;
      case 'list-ordered':
        formatCommand((s) => toggleList(s, 'ordered'))(view);
        break;
      case 'list-task':
        formatCommand((s) => toggleList(s, 'task'))(view);
        break;
      case 'horizontal-rule':
        formatCommand(insertHorizontalRule)(view);
        break;
      default:
        if (id.startsWith('heading-')) {
          const level = Number(id.slice('heading-'.length)) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
          formatCommand((s) => setHeading(s, level))(view);
        }
    }
    finish();
  };

  return (
    <>
      <div
        className="source-editor"
        ref={hostRef}
        style={{ '--editor-font-size': `${fontSize}px` } as React.CSSProperties}
      />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          ariaLabel="Formatting"
          onAction={handleMenuAction}
          onClose={(reason) => {
            setMenu(null);
            // Escape has nowhere else to send focus, so send it back to the editor. An outside
            // click already sent focus wherever the pointer landed - reclaiming it here would
            // fight that. An action's own handler (`handleMenuAction`'s `finish()`) already
            // focuses the editor once the action itself is done.
            if (reason === 'escape') viewRef.current?.focus();
          }}
        />
      )}
    </>
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
