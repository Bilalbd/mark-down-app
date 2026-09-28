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

  it('inserts [](url) with cursor inside [] when there is no word at the cursor', () => {
    // Between two spaces, so there's no word to wrap.
    const state = createState('text  here', { from: 5, to: 5 });
    const result = applyCommand(state, insertLink);
    expect(result.text).toBe('text [](url) here');
    expect(result.selection).toEqual({ from: 6, to: 6 });
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

  it('gives blank lines a bare > so the quote stays one block', () => {
    const state = createState('text\n\nmore', { from: 0, to: 10 });
    const result = applyCommand(state, toggleQuote);
    expect(result.text).toBe('> text\n>\n> more');
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
  it('inserts --- after the line with a blank line before it', () => {
    const state = createState('text', { from: 0, to: 0 });
    const result = applyCommand(state, insertHorizontalRule);
    expect(result.text).toBe('text\n\n---\n');
    expect(result.selection).toEqual({ from: 9, to: 9 });
  });

  it('uses the blank line the cursor is on, adding blank lines around the rule', () => {
    const state = createState('text\n\nmore', { from: 5, to: 5 });
    const result = applyCommand(state, insertHorizontalRule);
    expect(result.text).toBe('text\n\n---\n\nmore');
    expect(result.selection).toEqual({ from: 9, to: 9 });
  });

  it('never leaves the rule right under a paragraph (which would make a setext heading)', () => {
    const state = createState('para\nnext', { from: 2, to: 2 });
    const result = applyCommand(state, insertHorizontalRule);
    expect(result.text).toBe('para\n\n---\n\nnext');
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

describe('bug fixes', () => {
  describe('1. Selection preservation', () => {
    it('bold preserves selection around wrapped word', () => {
      const state = createState('bold text', { from: 0, to: 4 });
      const result = applyCommand(state, toggleBold);
      expect(result.text).toBe('**bold** text');
      expect(result.selection?.from).toBe(2);
      expect(result.selection?.to).toBe(6);
    });

    it('italic preserves selection around wrapped text', () => {
      const state = createState('hello world', { from: 0, to: 5 });
      const result = applyCommand(state, toggleItalic);
      expect(result.text).toBe('*hello* world');
      expect(result.selection?.from).toBe(1);
      expect(result.selection?.to).toBe(6);
    });
  });

  describe('2. insertLink bugs', () => {
    it('replaces word under cursor without duplication', () => {
      const state = createState('hello world', { from: 6, to: 6 });
      const result = applyCommand(state, insertLink);
      expect(result.text).toBe('hello [world](url)');
      expect(result.selection?.from).toBe(14);
      expect(result.selection?.to).toBe(17);
    });

    it('selects url when wrapping text', () => {
      const state = createState('text here', { from: 0, to: 4 });
      const result = applyCommand(state, insertLink);
      expect(result.text).toBe('[text](url) here');
      expect(result.selection?.from).toBe(7);
      expect(result.selection?.to).toBe(10);
    });

    it('selects url in empty brackets for URL text', () => {
      const state = createState('https://example.com', { from: 0, to: 19 });
      const result = applyCommand(state, insertLink);
      expect(result.text).toBe('[](https://example.com)');
      expect(result.selection?.from).toBe(1);
      expect(result.selection?.to).toBe(1);
    });
  });

  describe('3a. Unwrapping when markers are outside selection', () => {
    it('bold on **[word]** unwraps to word', () => {
      const state = createState('**word**', { from: 2, to: 6 });
      const result = applyCommand(state, toggleBold);
      expect(result.text).toBe('word');
      expect(result.selection?.from).toBe(0);
      expect(result.selection?.to).toBe(4);
    });
  });

  describe('3b. Nested marker unwrapping', () => {
    it('italic on ***x*** unwraps italic layer', () => {
      const state = createState('***x***', { from: 0, to: 7 });
      const result = applyCommand(state, toggleItalic);
      expect(result.text).toBe('**x**');
    });

    it('bold on ***x*** unwraps bold layer', () => {
      const state = createState('***x***', { from: 0, to: 7 });
      const result = applyCommand(state, toggleBold);
      expect(result.text).toBe('*x*');
    });
  });

  describe('3c. Word detection with special characters', () => {
    it('detects word with parentheses and comma', () => {
      const state = createState('(word),', { from: 2, to: 2 });
      const result = applyCommand(state, toggleBold);
      expect(result.text).toBe('(**word**),');
    });

    it('detects word at start', () => {
      const state = createState('word', { from: 0, to: 0 });
      const result = applyCommand(state, toggleBold);
      expect(result.text).toBe('**word**');
    });

    it('detects word at end', () => {
      const state = createState('word', { from: 4, to: 4 });
      const result = applyCommand(state, toggleBold);
      expect(result.text).toBe('**word**');
    });
  });

  describe('3d. Multi-line blank line preservation', () => {
    it('bold on multi-line with blank line', () => {
      const state = createState('one\n\ntwo', { from: 0, to: 8 });
      const result = applyCommand(state, toggleBold);
      expect(result.text).toBe('**one**\n\n**two**');
    });
  });

  describe('4a. List numbering from 1', () => {
    it('numbers ordered list starting from 1', () => {
      const state = createState('item1\nitem2\nitem3', { from: 0, to: 17 });
      const result = applyCommand(state, (s) => toggleList(s, 'ordered'));
      expect(result.text).toBe('1. item1\n2. item2\n3. item3');
    });

    it('numbers ordered list from 1 even when not at start', () => {
      const state = createState('start\nitem1\nitem2', { from: 6, to: 17 });
      const result = applyCommand(state, (s) => toggleList(s, 'ordered'));
      expect(result.text).toBe('start\n1. item1\n2. item2');
    });
  });

  describe('4b. Task list detection before bullet', () => {
    it('task list + task removes markers', () => {
      const state = createState('- [ ] x', { from: 0, to: 7 });
      const result = applyCommand(state, (s) => toggleList(s, 'task'));
      expect(result.text).toBe('x');
    });

    it('task list + bullet converts to bullet', () => {
      const state = createState('- [ ] x', { from: 0, to: 7 });
      const result = applyCommand(state, (s) => toggleList(s, 'bullet'));
      expect(result.text).toBe('- x');
    });

    it('bullet list + task converts to task', () => {
      const state = createState('- x', { from: 0, to: 3 });
      const result = applyCommand(state, (s) => toggleList(s, 'task'));
      expect(result.text).toBe('- [ ] x');
    });
  });

  describe('5. insertHorizontalRule positioning', () => {
    it('inserts rule after current line', () => {
      const state = createState('hello', { from: 3, to: 3 });
      const result = applyCommand(state, insertHorizontalRule);
      expect(result.text).toBe('hello\n\n---\n');
    });

    it('keeps existing blank lines', () => {
      // Cursor on the blank line between the paragraphs.
      const state = createState('a\n\nb', { from: 2, to: 2 });
      const result = applyCommand(state, insertHorizontalRule);
      expect(result.text).toBe('a\n\n---\n\nb');
    });
  });

  describe('6. toggleCodeBlock fence handling', () => {
    it('removes fences without leaving blank line', () => {
      const state = createState('```\ncode\n```', { from: 0, to: 12 });
      const result = applyCommand(state, toggleCodeBlock);
      expect(result.text).toBe('code');
    });

    it('removes fences when the cursor is inside the block', () => {
      const state = createState('before\n```js\nlet a;\n```\nafter', { from: 15, to: 15 });
      const result = applyCommand(state, toggleCodeBlock);
      expect(result.text).toBe('before\nlet a;\nafter');
      expect(result.selection).toEqual({ from: 9, to: 9 });
    });

    it('adds fence with exact newline placement', () => {
      const state = createState('a\nb', { from: 0, to: 3 });
      const result = applyCommand(state, toggleCodeBlock);
      expect(result.text).toBe('```\na\nb\n```');
      expect(result.selection).toEqual({ from: 3, to: 3 });
    });

    it('adds an empty block on an empty line, cursor after the opening fence', () => {
      const state = createState('a\n\nb', { from: 2, to: 2 });
      const result = applyCommand(state, toggleCodeBlock);
      expect(result.text).toBe('a\n```\n\n```\nb');
      expect(result.selection).toEqual({ from: 5, to: 5 });
    });

    it('removes ~~~ fence', () => {
      const state = createState('~~~\ncode\n~~~', { from: 0, to: 12 });
      const result = applyCommand(state, toggleCodeBlock);
      expect(result.text).toBe('code');
    });
  });

  describe('7. toggleQuote blank line handling', () => {
    it('quotes with blank line in middle', () => {
      const state = createState('a\n\nb', { from: 0, to: 4 });
      const result = applyCommand(state, toggleQuote);
      expect(result.text).toBe('> a\n>\n> b');
    });

    it('unquotes with blank line in middle', () => {
      const state = createState('> a\n>\n> b', { from: 0, to: 9 });
      const result = applyCommand(state, toggleQuote);
      expect(result.text).toBe('a\n\nb');
    });
  });

  describe('supervisor additions', () => {
    const multi = (doc: string, ranges: [number, number][]) =>
      EditorState.create({
        doc,
        selection: EditorSelection.create(ranges.map(([f, t]) => EditorSelection.range(f, t))),
        extensions: [
          markdown({ base: markdownLanguage }),
          EditorState.allowMultipleSelections.of(true),
        ],
      });

    it('bolds every selection range in one transaction', () => {
      const state = multi('one two', [
        [0, 3],
        [4, 7],
      ]);
      const next = state.update(toggleBold(state)!).state;
      expect(next.doc.toString()).toBe('**one** **two**');
      expect(next.selection.ranges.map((r) => [r.from, r.to])).toEqual([
        [2, 5],
        [10, 13],
      ]);
    });

    it('keeps the cursor where it was inside the word', () => {
      const result = applyCommand(createState('hello world', { from: 8, to: 8 }), toggleBold);
      expect(result.text).toBe('hello **world**');
      expect(result.selection).toEqual({ from: 10, to: 10 });
    });

    it('keeps the cursor inside the word when it sat at the word end', () => {
      const result = applyCommand(createState('word', { from: 4, to: 4 }), toggleBold);
      expect(result.selection).toEqual({ from: 6, to: 6 });
    });

    it('unbolds the word under the cursor', () => {
      const result = applyCommand(createState('a **word** b', { from: 6, to: 6 }), toggleBold);
      expect(result.text).toBe('a word b');
      expect(result.selection).toEqual({ from: 4, to: 4 });
    });

    it('italic inside bold adds a star on each side', () => {
      const result = applyCommand(createState('**word**', { from: 2, to: 6 }), toggleItalic);
      expect(result.text).toBe('***word***');
      expect(result.selection).toEqual({ from: 3, to: 7 });
    });

    it('keeps an apostrophe inside a word', () => {
      const result = applyCommand(createState("Bilal's app", { from: 3, to: 3 }), toggleItalic);
      expect(result.text).toBe("*Bilal's* app");
    });

    it('unwraps inline code with padding spaces', () => {
      const result = applyCommand(createState('`` `x ``', { from: 0, to: 8 }), toggleInlineCode);
      expect(result.text).toBe('`x');
    });

    it('does not add # to a setext heading', () => {
      expect(setHeading(createState('Title\n=====', { from: 0, to: 11 }), 1)).toBeNull();
    });

    it('changes a heading level in place, keeping list markers', () => {
      const result = applyCommand(createState('- ## Item', { from: 5, to: 5 }), (s) =>
        setHeading(s, 3),
      );
      expect(result.text).toBe('- ### Item');
      expect(result.selection).toEqual({ from: 6, to: 6 });
    });

    it('does not include the line a whole-line selection ends on', () => {
      const result = applyCommand(createState('a\nb\nc', { from: 0, to: 4 }), (s) =>
        toggleList(s, 'bullet'),
      );
      expect(result.text).toBe('- a\n- b\nc');
    });

    it('keeps quote markers in front of a new list marker', () => {
      const result = applyCommand(createState('> a', { from: 2, to: 2 }), (s) =>
        toggleList(s, 'ordered'),
      );
      expect(result.text).toBe('> 1. a');
    });

    it('removes one level from a nested quote', () => {
      const result = applyCommand(createState('> > a', { from: 0, to: 5 }), toggleQuote);
      expect(result.text).toBe('> a');
    });
  });

  describe('8. setHeading blank line handling', () => {
    it('does not add heading to blank lines', () => {
      const state = createState('a\n\nb', { from: 0, to: 4 });
      const result = applyCommand(state, (s) => setHeading(s, 2));
      expect(result.text).toBe('## a\n\n## b');
      expect(result.text).not.toContain('## \n');
    });
  });
});
