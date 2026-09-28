import { describe, expect, it } from 'vitest';
import { suggestFileName } from './fileName';

describe('suggestFileName', () => {
  it('uses the heading text even when an earlier line in the content differs', () => {
    const content = 'Not the heading text\n\n# Real heading\n';
    expect(suggestFileName(content, 'Real heading')).toBe('Real heading.md');
  });

  it('falls back to the first non-empty line when there is no heading', () => {
    const content = '\nFirst actual line\n\nSecond line\n';
    expect(suggestFileName(content, null)).toBe('First actual line.md');
  });

  it('skips a leading YAML front matter block when there is no heading', () => {
    const content = '---\ntitle: X\ndate: 2026-01-01\n---\n\nFirst real line\n';
    expect(suggestFileName(content, null)).toBe('First real line.md');
  });

  it('cuts six or more words down to five', () => {
    expect(suggestFileName('one two three four five six seven', null)).toBe(
      'one two three four five.md',
    );
  });

  it('matches the worked example: colon removed, only five words kept', () => {
    expect(suggestFileName('', 'Weekly plan: Q4 goals and more words')).toBe(
      'Weekly plan Q4 goals and.md',
    );
  });

  it('strips an ATX heading marker', () => {
    expect(suggestFileName('## Section title', null)).toBe('Section title.md');
  });

  it('strips a bullet list marker', () => {
    expect(suggestFileName('- List item text', null)).toBe('List item text.md');
  });

  it('strips an ordered list marker', () => {
    expect(suggestFileName('1. Ordered item', null)).toBe('Ordered item.md');
  });

  it('strips a blockquote marker', () => {
    expect(suggestFileName('> Quoted line', null)).toBe('Quoted line.md');
  });

  it('strips a task checkbox, unchecked or checked', () => {
    expect(suggestFileName('- [ ] Task name', null)).toBe('Task name.md');
    expect(suggestFileName('- [x] Done task', null)).toBe('Done task.md');
  });

  it('strips emphasis and code markers', () => {
    expect(suggestFileName('*Bold* _italic_ ~strike~ `code`', null)).toBe(
      'Bold italic strike code.md',
    );
  });

  it('replaces a link with its text', () => {
    expect(suggestFileName('Check [this link](http://example.com) out', null)).toBe(
      'Check this link out.md',
    );
  });

  it('replaces an image with its alt text', () => {
    expect(suggestFileName('![alt text](img.png) caption', null)).toBe('alt text caption.md');
  });

  it('strips HTML tags', () => {
    expect(suggestFileName('<b>Bold</b> text', null)).toBe('Bold text.md');
  });

  it('removes every character Windows forbids in file names', () => {
    // '<' and '>' are tested unpaired here since a paired "<x>" is legitimately stripped
    // as an HTML tag (see the "strips HTML tags" test above).
    expect(suggestFileName('', 'A:B"C/D\\E|F?G*H')).toBe('ABCDEFGH.md');
    expect(suggestFileName('', 'A<B')).toBe('AB.md');
    expect(suggestFileName('', 'A>B')).toBe('AB.md');
  });

  it('removes control characters', () => {
    expect(suggestFileName('', 'Foo\x01Bar')).toBe('FooBar.md');
  });

  it('trims trailing dots', () => {
    expect(suggestFileName('', 'Trailing dots...')).toBe('Trailing dots.md');
  });

  it('trims leading dots', () => {
    expect(suggestFileName('', '...Leading dots')).toBe('Leading dots.md');
  });

  it('falls back to Untitled for a reserved device name, case-insensitively', () => {
    expect(suggestFileName('', 'con')).toBe('Untitled.md');
    expect(suggestFileName('', 'Com1')).toBe('Untitled.md');
  });

  it('falls back to Untitled.md for an empty document', () => {
    expect(suggestFileName('', null)).toBe('Untitled.md');
  });

  it('falls back to Untitled.md for a whitespace-only document', () => {
    expect(suggestFileName('   \n\n   \n', null)).toBe('Untitled.md');
  });

  it('keeps non-Latin text (Arabic) unchanged', () => {
    const arabic = 'مرحبا العالم';
    expect(suggestFileName('', arabic)).toBe(`${arabic}.md`);
  });

  it('keeps emoji', () => {
    const withEmoji = '\u{1F389} Party time';
    expect(suggestFileName('', withEmoji)).toBe(`${withEmoji}.md`);
  });

  it('caps a 200-character single-word line at 60 characters', () => {
    const longLine = 'a'.repeat(200);
    const result = suggestFileName(longLine, null);
    expect(result).toBe(`${'a'.repeat(60)}.md`);
  });

  it('cuts a long multi-word result at a word boundary rather than mid-word', () => {
    const words = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc', 'dddddddddddd', 'eeeeeeeeeeee'];
    const result = suggestFileName(words.join(' '), null);
    const nameOnly = result.slice(0, -'.md'.length);
    expect(nameOnly.length).toBeLessThanOrEqual(60);
    expect(words).toContain(nameOnly.split(' ').pop());
    expect(nameOnly.endsWith(' ')).toBe(false);
  });
});
