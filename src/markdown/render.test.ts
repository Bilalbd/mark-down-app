import { describe, expect, it } from 'vitest';
import { extractHeadings, renderMarkdown } from './render';
import { slugify } from './plugins';

describe('renderMarkdown', () => {
  it('renders GFM tables, strikethrough and autolinks', async () => {
    const { html } = await renderMarkdown(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~ https://example.com',
    );
    expect(html).toContain('<table');
    expect(html).toContain('<s>gone</s>');
    expect(html).toContain('href="https://example.com"');
  });

  it('renders task lists as disabled checkboxes', async () => {
    const { html } = await renderMarkdown('- [x] done\n- [ ] todo');
    expect(html).toContain('class="contains-task-list"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toMatch(/checked[^>]*>\s*done/);
    expect(html).not.toContain('[x]');
  });

  it('adds data-line attributes to block elements', async () => {
    const { html } = await renderMarkdown('# Title\n\npara\n\n- item');
    expect(html).toContain('<h1 data-line="0"');
    expect(html).toContain('<p data-line="2"');
    expect(html).toContain('<ul data-line="4"');
  });

  it('highlights fenced code with dual-theme Shiki output', async () => {
    const { html } = await renderMarkdown('```ts\nconst x: number = 1;\n```');
    expect(html).toContain('class="code-block" data-lang="ts"');
    expect(html).toContain('--shiki-light');
    expect(html).toContain('--shiki-dark');
  });

  it('falls back gracefully for unknown languages', async () => {
    const { html } = await renderMarkdown('```nosuchlang\nhello\n```');
    expect(html).toContain('hello');
    expect(html).toContain('data-lang="nosuchlang"');
  });

  it('keeps mermaid blocks as source for later client-side rendering', async () => {
    const { html } = await renderMarkdown('```mermaid\nflowchart LR\n A-->B\n```');
    expect(html).toContain('class="mermaid-block"');
    expect(html).toContain('A--&gt;B');
  });

  it('strips scripts and event handlers but keeps safe inline HTML', async () => {
    const { html } = await renderMarkdown(
      '<script>alert(1)</script><kbd onclick="x()">Ctrl</kbd><img src="javascript:alert(1)">',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).toContain('<kbd>Ctrl</kbd>');
    expect(html).not.toContain('javascript:');
  });

  it('resolves relative image paths through the asset resolver', async () => {
    const { html } = await renderMarkdown('![x](images/a.png) ![y](https://h/b.png)', {
      baseDir: 'C:\\docs\\notes',
      toAssetUrl: (p) => `asset://${p.replace(/\\/g, '/')}`,
    });
    expect(html).toContain('src="asset://C:/docs/notes/images/a.png"');
    expect(html).toContain('src="https://h/b.png"');
  });

  it('decodes percent-encoded and non-ASCII image paths before resolving them', async () => {
    const { html } = await renderMarkdown('![a](<my image.png>) ![b](café.png)', {
      baseDir: 'C:\\docs\\notes',
      toAssetUrl: (p) => `asset://${p.replace(/\\/g, '/')}`,
    });
    expect(html).toContain('src="asset://C:/docs/notes/my image.png"');
    expect(html).toContain('src="asset://C:/docs/notes/café.png"');
  });

  it('renders footnotes', async () => {
    const { html } = await renderMarkdown('ref[^1]\n\n[^1]: note');
    expect(html).toContain('footnote');
  });

  it('blocks remote images when blockRemoteImages is set', async () => {
    const { html } = await renderMarkdown('![x](https://evil.example/x.png)', {
      blockRemoteImages: true,
    });
    expect(html).not.toContain('src="https://evil.example/x.png"');
    expect(html).toContain('remote-image-blocked');
  });

  it('loads remote images when blockRemoteImages is unset', async () => {
    const { html } = await renderMarkdown('![x](https://example.com/x.png)');
    expect(html).toContain('src="https://example.com/x.png"');
  });
});

describe('headings / outline', () => {
  it('extracts headings with levels, lines and deduplicated ids', () => {
    const h = extractHeadings('# A\n\n## B\n\n## B\n\n### C *em* `code`');
    expect(h.map((x) => [x.level, x.text, x.id, x.line])).toEqual([
      [1, 'A', 'a', 0],
      [2, 'B', 'b', 2],
      [2, 'B', 'b-1', 4],
      [3, 'C em code', 'c-em-code', 6],
    ]);
  });

  it('injects the same ids into the rendered html', async () => {
    const { html, headings } = await renderMarkdown('## Hello World!');
    expect(headings[0].id).toBe('hello-world');
    expect(html).toContain('id="hello-world"');
  });

  it('slugifies unicode and punctuation like github-slugger', () => {
    expect(slugify('Ünïcode & Symbols?')).toBe('ünïcode--symbols');
    expect(slugify('中文 标题')).toBe('中文-标题');
    expect(slugify('!!!')).toBe('section');
    expect(slugify('foo_bar')).toBe('foo_bar');
    expect(slugify('A & B')).toBe('a--b');
    expect(slugify('C++ / Rust')).toBe('c--rust');
  });

  it('never reuses an id, even one produced by a dedup suffix', () => {
    const h = extractHeadings('# foo\n\n# foo\n\n# foo-1');
    expect(h.map((x) => x.id)).toEqual(['foo', 'foo-1', 'foo-1-1']);
  });
});

describe('math', () => {
  it('renders inline and display KaTeX with SVG radicals kept', async () => {
    const { html } = await renderMarkdown('a $\\sqrt{2}$ b\n\n$$\nx^2\n$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).toContain('<path d="');
  });
  it('leaves ordinary dollar amounts alone', async () => {
    const { html } = await renderMarkdown('costs $5 and $10 today');
    expect(html).not.toContain('katex');
    expect(html).toContain('$5 and $10');
  });
});
