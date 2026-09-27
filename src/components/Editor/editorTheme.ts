import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Editor chrome theme driven entirely by app CSS variables, so it follows the
 * light/dark app theme without reconfiguration.
 */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--content-bg)',
    color: 'var(--content-fg)',
    fontSize: 'var(--editor-font-size, 14px)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
    overflow: 'auto',
  },
  '.cm-content': {
    padding: '16px 0 60vh',
    caretColor: 'var(--content-fg)',
  },
  '.cm-line': { padding: '0 24px 0 8px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--content-fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent) !important',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--content-fg) 7%, transparent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--content-bg)',
    color: 'color-mix(in srgb, var(--chrome-fg-muted) 55%, transparent)',
    border: 'none',
    paddingLeft: '8px',
    fontWeight: '400',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--content-fg) 7%, transparent)',
    color: 'var(--content-fg)',
    fontWeight: '400',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '3ch',
    fontSize: '0.85em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
    outline: 'none',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, #e6b400 40%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, #ff8c00 60%, transparent)',
  },
  '.cm-panels': { border: 'none', background: 'transparent' },
  '.cm-panel input, .cm-panel button': {
    font: 'inherit',
    background: 'var(--chrome-inset)',
    color: 'var(--chrome-fg)',
    border: '1px solid var(--chrome-border)',
    borderRadius: '4px',
    padding: '2px 6px',
  },
});

/** Markdown token colouring; values are CSS variables with sensible fallbacks. */
const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '600', color: 'var(--ed-heading, var(--content-fg))' },
  { tag: t.heading1, fontSize: '1.4em' },
  { tag: t.heading2, fontSize: '1.25em' },
  { tag: t.heading3, fontSize: '1.1em' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--ed-code, #c7254e)' },
  { tag: t.quote, color: 'var(--chrome-fg-muted)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--accent)' },
  { tag: t.processingInstruction, color: 'var(--chrome-fg-muted)' },
  { tag: t.contentSeparator, color: 'var(--chrome-fg-muted)' },
  { tag: t.labelName, color: 'var(--accent)' },
  { tag: t.meta, color: 'var(--chrome-fg-muted)' },
  { tag: t.comment, color: 'var(--chrome-fg-muted)', fontStyle: 'italic' },
  { tag: t.keyword, color: 'var(--ed-keyword, #a626a4)' },
  { tag: t.string, color: 'var(--ed-string, #50a14f)' },
  { tag: t.number, color: 'var(--ed-number, #986801)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--ed-fn, #4078f2)' },
  { tag: t.typeName, color: 'var(--ed-type, #c18401)' },
]);

export const editorHighlighting = syntaxHighlighting(markdownHighlight);
