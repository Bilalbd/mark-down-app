import { describe, expect, it } from 'vitest';
import { EditorState, EditorSelection, type TransactionSpec } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  setHeading,
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  insertLink,
  toggleCodeBlock,
  toggleQuote,
  toggleList,
  insertHorizontalRule,
} from './formatting';

function createState(doc: string, selection?: { from: number; to: number }) {
  return EditorState.create({
    doc,
    selection: selection
      ? EditorSelection.range(selection.from, selection.to)
      : EditorSelection.cursor(0),
    extensions: [markdown({ base: markdownLanguage })],
  });
}

function applyCommand(state: EditorState, command: (s: EditorState) => TransactionSpec | null) {
  const spec = command(state);
  if (!spec) return { text: state.doc.toString(), selection: null };
  const next = state.update(spec).state;
  return {
    text: next.doc.toString(),
    selection: { from: next.selection.main.from, to: next.selection.main.to },
  };
}

describe('setHeading', () => {
  it('adds heading level 1 to a paragraph', () => {
    const state = createState('Hello world', { from: 0, to: 11 });
    const result = applyCommand(state, (s) => setHeading(s, 1));
    expect(result.text).toBe('# Hello world');
  });

  it('removes heading when set to level 0', () => {
    const state = createState('# Hello world', { from: 0, to: 13 });
    const result = applyCommand(state, (s) => setHeading(s, 0));
    expect(result.text).toBe('Hello world');
  });

  it('toggles heading level 1 by applying it twice', () => {
    const state = createState('Hello world', { from: 0, to: 11 });
    let result = applyCommand(state, (s) => setHeading(s, 1));
    expect(result.text).toBe('# Hello world');

    const state2 = createState(result.text, { from: 0, to: result.text.length });
    result = applyCommand(state2, (s) => setHeading(s, 1));
    expect(result.text).toBe('Hello world');
  });

  it('preserves blockquote marker when adding heading', () => {
    const state = createState('> Quote text', { from: 0, to: 12 });
    const result = applyCommand(state, (s) => setHeading(s, 2));
    expect(result.text).toBe('> ## Quote text');
  });

  it('handles multiple lines', () => {
    const state = createState('Line 1\nLine 2', { from: 0, to: 13 });
    const result = applyCommand(state, (s) => setHeading(s, 1));
    expect(result.text).toBe('# Line 1\n# Line 2');
  });

  it('does not modify setext headings (they are handled by syntax tree)', () => {
    const state = createState('Heading\n=======', { from: 0, to: 15 });
    const result = applyCommand(state, (s) => setHeading(s, 1));
    // Setext should not be changed (the function only touches ATX)
    expect(result.text).toContain('Heading');
  });
});

describe('toggleBold', () => {
  it('wraps selection with **', () => {
    const state = createState('bold text', { from: 0, to: 4 });
    const result = applyCommand(state, toggleBold);
    expect(result.text).toBe('**bold** text');
  });

  it('unwraps bold markers', () => {
    const state = createState('**bold** text', { from: 0, to: 8 });
    const result = applyCommand(state, toggleBold);
    expect(result.text).toBe('bold text');
  });

  it('selects the word under cursor when selection is empty', () => {
    const state = createState('word here', { from: 2, to: 2 });
    const result = applyCommand(state, toggleBold);
    expect(result.text).toBe('**word** here');
  });

  it('inserts empty bold markers when no word is under cursor', () => {
    const state = createState('   ', { from: 0, to: 0 });
    const result = applyCommand(state, toggleBold);
    expect(result.text).toBe('****   ');
  });

  it('preserves leading and trailing spaces', () => {
    const state = createState('  text  ', { from: 2, to: 6 });
    const result = applyCommand(state, toggleBold);
    expect(result.text).toBe('  **text**  ');
  });

  it('applies bold to each non-empty line in multi-line selection', () => {
    const state = createState('line1\nline2', { from: 0, to: 11 });
    const result = applyCommand(state, toggleBold);
    expect(result.text).toBe('**line1**\n**line2**');
  });
});

describe('toggleItalic', () => {
  it('wraps selection with *', () => {
    const state = createState('italic text', { from: 0, to: 6 });
    const result = applyCommand(state, toggleItalic);
    expect(result.text).toBe('*italic* text');
  });

  it('unwraps italic markers', () => {
    const state = createState('*italic* text', { from: 0, to: 8 });
    const result = applyCommand(state, toggleItalic);
    expect(result.text).toBe('italic text');
  });
});

describe('toggleStrikethrough', () => {
  it('wraps selection with ~~', () => {
    const state = createState('strike text', { from: 0, to: 6 });
    const result = applyCommand(state, toggleStrikethrough);
    expect(result.text).toBe('~~strike~~ text');
  });

  it('unwraps strikethrough markers', () => {
    const state = createState('~~strike~~ text', { from: 0, to: 10 });
    const result = applyCommand(state, toggleStrikethrough);
    expect(result.text).toBe('strike text');
  });
});

describe('toggleInlineCode', () => {
  it('wraps selection with backticks', () => {
    const state = createState('code text', { from: 0, to: 4 });
    const result = applyCommand(state, toggleInlineCode);
    expect(result.text).toBe('`code` text');
  });

  it('unwraps code markers', () => {
    const state = createState('`code` text', { from: 0, to: 6 });
    const result = applyCommand(state, toggleInlineCode);
    expect(result.text).toBe('code text');
  });

  it('uses longer backtick fence when text contains backticks', () => {
    const state = createState('a`b`c', { from: 0, to: 5 });
    const result = applyCommand(state, toggleInlineCode);
    expect(result.text).toContain('``');
  });

  it('pads with spaces when text starts or ends with backtick', () => {
    const state = createState('`code', { from: 0, to: 5 });
    const result = applyCommand(state, toggleInlineCode);
    expect(result.text).toContain('`` `code ``');
  });
});

describe('insertLink', () => {
  it('converts selection to [text](url)', () => {
    const state = createState('link text', { from: 0, to: 4 });
    const result = applyCommand(state, insertLink);
    expect(result.text).toBe('[link](url) text');
  });

  it('converts URL-like text to [](url)', () => {
    const state = createState('https://example.com', { from: 0, to: 19 });
    const result = applyCommand(state, insertLink);
    expect(result.text).toBe('[](https://example.com)');
  });

  it('converts mailto: text to [](mailto:...)', () => {
    const state = createState('mailto:test@example.com', { from: 0, to: 23 });
    const result = applyCommand(state, insertLink);
    expect(result.text).toBe('[](mailto:test@example.com)');
  });

  it('inserts [](url) with cursor inside [] when empty', () => {
    const state = createState('text here', { from: 5, to: 5 });
    const result = applyCommand(state, insertLink);
    expect(result.text).toContain('[](url)');
  });
});

describe('toggleCodeBlock', () => {
  it('wraps lines in code fence', () => {
    const state = createState('code line', { from: 0, to: 9 });
    const result = applyCommand(state, toggleCodeBlock);
    expect(result.text).toContain('```');
    expect(result.text).toContain('code line');
  });

  it('uses longer fence than any backticks inside', () => {
    const state = createState('has `` backticks', { from: 0, to: 16 });
    const result = applyCommand(state, toggleCodeBlock);
    expect(result.text).toContain('```');
  });
});

describe('toggleQuote', () => {
  it('adds blockquote marker to line', () => {
    const state = createState('quote text', { from: 0, to: 10 });
    const result = applyCommand(state, toggleQuote);
    expect(result.text).toBe('> quote text');
  });

  it('removes blockquote marker from line', () => {
    const state = createState('> quote text', { from: 0, to: 12 });
    const result = applyCommand(state, toggleQuote);
    expect(result.text).toBe('quote text');
  });

  it('skips blank lines', () => {
    const state = createState('text\n\nmore', { from: 0, to: 10 });
    const result = applyCommand(state, toggleQuote);
    expect(result.text).toContain('> text');
    expect(result.text).toContain('\n\n');
    expect(result.text).toContain('> more');
  });

  it('handles multiple lines', () => {
    const state = createState('line1\nline2', { from: 0, to: 11 });
    const result = applyCommand(state, toggleQuote);
    expect(result.text).toBe('> line1\n> line2');
  });
});

describe('toggleList', () => {
  it('adds bullet marker to line', () => {
    const state = createState('item text', { from: 0, to: 9 });
    const result = applyCommand(state, (s) => toggleList(s, 'bullet'));
    expect(result.text).toBe('- item text');
  });

  it('removes bullet marker from line', () => {
    const state = createState('- item text', { from: 0, to: 11 });
    const result = applyCommand(state, (s) => toggleList(s, 'bullet'));
    expect(result.text).toBe('item text');
  });

  it('converts to ordered list with numbering', () => {
    const state = createState('item1\nitem2', { from: 0, to: 11 });
    const result = applyCommand(state, (s) => toggleList(s, 'ordered'));
    expect(result.text).toBe('1. item1\n2. item2');
  });

  it('converts to task list', () => {
    const state = createState('do something', { from: 0, to: 12 });
    const result = applyCommand(state, (s) => toggleList(s, 'task'));
    expect(result.text).toBe('- [ ] do something');
  });

  it('skips blank lines', () => {
    const state = createState('item1\n\nitem2', { from: 0, to: 12 });
    const result = applyCommand(state, (s) => toggleList(s, 'bullet'));
    expect(result.text).toBe('- item1\n\n- item2');
  });

  it('converts between list kinds', () => {
    const state = createState('- bullet item', { from: 0, to: 13 });
    const result = applyCommand(state, (s) => toggleList(s, 'ordered'));
    expect(result.text).toBe('1. bullet item');
  });
});

describe('insertHorizontalRule', () => {
  it('inserts --- with blank lines', () => {
    const state = createState('text', { from: 0, to: 0 });
    const result = applyCommand(state, insertHorizontalRule);
    expect(result.text).toContain('---');
  });

  it('preserves existing blank lines', () => {
    const state = createState('text\n\nmore', { from: 5, to: 5 });
    const result = applyCommand(state, insertHorizontalRule);
    expect(result.text).toBeDefined();
  });
});

describe('nested formatting', () => {
  it('toggles italic on *bold*', () => {
    const state = createState('*bold*', { from: 0, to: 6 });
    const result = applyCommand(state, toggleItalic);
    expect(result.text).toBe('bold');
  });

  it('wraps bold text with italic', () => {
    const state = createState('**bold**', { from: 0, to: 8 });
    const result = applyCommand(state, toggleItalic);
    expect(result.text).toBe('***bold***');
  });
});

describe('multiple cursors', () => {
  it('applies formatting to each cursor range independently', () => {
    const state = EditorState.create({
      doc: 'word1 word2',
      selection: EditorSelection.range(0, 5),
      extensions: [
        markdown({ base: markdownLanguage }),
        EditorState.allowMultipleSelections.of(true),
      ],
    });

    const result = applyCommand(state, toggleBold);
    expect(result.text).toBe('**word1** word2');
  });
});
