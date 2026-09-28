import { describe, expect, it } from 'vitest';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { proseRanges, splitRangesByLine } from './proseRanges';

/** Parses with the same GFM parser the editor uses, and returns the checked substrings for
 * the full document (so tests read like "this text is/isn't checked" rather than juggling
 * offsets). */
function checkedText(doc: string): string {
  const tree = markdownLanguage.parser.parse(doc);
  return proseRanges(tree, doc, 0, doc.length)
    .map((r) => doc.slice(r.from, r.to))
    .join('|');
}

describe('proseRanges - excluded constructs', () => {
  it('excludes fenced code', () => {
    const doc = 'before\n\n```js\ncode wiht\n```\n\nafter';
    expect(checkedText(doc)).not.toContain('wiht');
    expect(checkedText(doc)).toContain('before');
    expect(checkedText(doc)).toContain('after');
  });

  it('excludes indented code', () => {
    const doc = 'para\n\n    indented wiht\n\nafter';
    expect(checkedText(doc)).not.toContain('wiht');
  });

  it('excludes inline code', () => {
    const doc = 'text `code wiht` more';
    const checked = checkedText(doc);
    expect(checked).not.toContain('wiht');
    expect(checked).toContain('text');
    expect(checked).toContain('more');
  });

  it('excludes a bare autolink URL', () => {
    const doc = 'see http://example.com/wiht here';
    const checked = checkedText(doc);
    expect(checked).not.toContain('wiht');
    expect(checked).toContain('see');
    expect(checked).toContain('here');
  });

  it('excludes an explicit autolink', () => {
    const doc = 'see <http://example.com/wiht> here';
    expect(checkedText(doc)).not.toContain('wiht');
  });

  it('excludes a link destination but keeps the link text', () => {
    const doc = '[link txt](http://example.com/wiht)';
    const checked = checkedText(doc);
    expect(checked).not.toContain('wiht');
    expect(checked).toContain('link txt');
  });

  it('excludes an image destination but keeps the alt text', () => {
    const doc = '![alt txt](img/wiht.png)';
    const checked = checkedText(doc);
    expect(checked).not.toContain('wiht');
    expect(checked).toContain('alt txt');
  });

  it('excludes a whole reference definition', () => {
    const doc = '[ref]: http://example.com/wiht "titlewiht"\n\nUse [ref] label.';
    const checked = checkedText(doc);
    expect(checked).not.toContain('wiht');
    expect(checked).toContain('label');
  });

  it('excludes an HTML tag and block', () => {
    const doc = 'before <span data-wiht="x">text</span>\n\n<div>\nwiht\n</div>\n\nafter';
    const checked = checkedText(doc);
    expect(checked).not.toContain('data-wiht');
    expect(checked).toContain('text');
  });

  it('excludes an HTML comment', () => {
    const doc = 'before <!-- wiht --> after';
    expect(checkedText(doc)).not.toContain('wiht');
  });

  it('excludes inline and block maths', () => {
    const doc = 'inline $x^{wiht}$ text\n\n$$\ny = wiht\n$$\n\nafter';
    const checked = checkedText(doc);
    expect(checked).not.toContain('wiht');
    expect(checked).toContain('inline');
    expect(checked).toContain('after');
  });

  it('does not treat two separate inline maths spans as one block', () => {
    const doc = 'a $x$ b $y$ c';
    expect(checkedText(doc)).toBe('a | b | c');
  });

  it('excludes a YAML front matter block at the very top only', () => {
    const doc = '---\ntitle: wiht\n---\n\n# Heading\n\nbody';
    const checked = checkedText(doc);
    expect(checked).not.toContain('wiht');
    expect(checked).toContain('Heading');
    expect(checked).toContain('body');
  });

  it('does not treat --- later in the document as front matter', () => {
    const doc = 'para\n\n---\n\nafter wiht';
    expect(checkedText(doc)).toContain('wiht');
  });

  it('excludes a HEX colour code', () => {
    const doc = 'the colour #AA00BB is nice';
    const checked = checkedText(doc);
    expect(checked).not.toContain('AA00BB');
    expect(checked).toContain('colour');
    expect(checked).toContain('nice');
  });

  it('keeps an 8-digit hex-like run untouched by the 6-digit exclusion', () => {
    const doc = 'code #AA00BB11 end';
    expect(checkedText(doc)).toContain('AA00BB11');
  });
});

describe('proseRanges - included constructs', () => {
  it('checks heading text', () => {
    expect(checkedText('# Heading wiht')).toContain('Heading wiht');
  });

  it('checks table cells', () => {
    const doc = '| a | b |\n|---|---|\n| wiht | d |\n';
    expect(checkedText(doc)).toContain('wiht');
  });

  it('checks list items', () => {
    expect(checkedText('- item wiht\n- other')).toContain('item wiht');
  });

  it('checks blockquotes', () => {
    expect(checkedText('> quoted wiht text')).toContain('quoted wiht text');
  });

  it('checks emphasis and strong text', () => {
    expect(checkedText('*em wiht* and **strong wiht**')).toContain('em wiht');
  });
});

describe('proseRanges - windowing', () => {
  it('only returns ranges inside [from, to)', () => {
    const doc = 'aaaa bbbb cccc';
    const tree = markdownLanguage.parser.parse(doc);
    const ranges = proseRanges(tree, doc, 5, 9);
    expect(ranges).toEqual([{ from: 5, to: 9 }]);
  });
});

describe('splitRangesByLine', () => {
  it('splits a multi-line range at each line boundary', () => {
    const doc = 'line one\nline two\nline three';
    const ranges = splitRangesByLine(doc, [{ from: 0, to: doc.length }]);
    expect(ranges.map((r) => doc.slice(r.from, r.to))).toEqual([
      'line one',
      'line two',
      'line three',
    ]);
  });

  it('leaves a single-line range unsplit', () => {
    const doc = 'line one\nline two';
    const ranges = splitRangesByLine(doc, [{ from: 0, to: 4 }]);
    expect(ranges).toEqual([{ from: 0, to: 4 }]);
  });

  it('splits a range that starts and ends mid-line', () => {
    const doc = 'aaaa\nbbbb\ncccc';
    // "aa\nbbbb\ncc" - starts mid first line, ends mid last line
    const ranges = splitRangesByLine(doc, [{ from: 2, to: 12 }]);
    expect(ranges.map((r) => doc.slice(r.from, r.to))).toEqual(['aa', 'bbbb', 'cc']);
  });
});
