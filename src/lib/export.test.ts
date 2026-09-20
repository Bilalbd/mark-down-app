import { describe, expect, it } from 'vitest';
import { buildExportHtml, rewriteAssetUrls } from './export';
import { renderMarkdown } from '@/markdown/render';
import { BUILTIN_PRESETS } from '@/store/style';

describe('rewriteAssetUrls', () => {
  it('turns asset-protocol URLs into file:// URLs', () => {
    const html = '<img src="http://asset.localhost/C%3A%5Cdocs%5Cimg%20a.png" alt="">';
    expect(rewriteAssetUrls(html)).toBe('<img src="file:///C:/docs/img a.png" alt="">');
  });
  it('leaves other URLs alone', () => {
    const html = '<a href="https://x.y/z">z</a><img src="images/a.png">';
    expect(rewriteAssetUrls(html)).toBe(html);
  });
});

describe('buildExportHtml', () => {
  it('produces a standalone document with preset styling and code theme', async () => {
    const { html: body } = await renderMarkdown('# T\n\n```ts\nlet a = 1;\n```\n\n$x^2$');
    const out = buildExportHtml({
      title: 'A "quoted" <title>',
      bodyHtml: body,
      preset: BUILTIN_PRESETS[2],
      theme: 'dark',
    });
    expect(out).toContain('<title>A &quot;quoted&quot; &lt;title&gt;</title>');
    expect(out).toContain('data-theme="dark"');
    expect(out).toContain('--md-bg: #262624');
    expect(out).toContain('.preview .shiki,.preview .shiki span{color:var(--shiki-dark);}');
    expect(out).toContain('katex.min.css'); // math present → KaTeX stylesheet linked
    expect(out).toContain('<h1 data-line="0"');
  });
  it('omits the KaTeX stylesheet when there is no math', async () => {
    const { html: body } = await renderMarkdown('plain');
    const out = buildExportHtml({
      title: 't',
      bodyHtml: body,
      preset: BUILTIN_PRESETS[0],
      theme: 'light',
    });
    expect(out).not.toContain('katex.min.css');
  });
});
