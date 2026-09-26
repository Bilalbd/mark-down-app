import { describe, expect, it } from 'vitest';
import { buildExportHtml, rewriteAssetUrls, toFileUrl } from './export';
import { renderMarkdown } from '@/markdown/render';
import { BUILTIN_PRESETS } from '@/store/style';

describe('toFileUrl', () => {
  it('encodes spaces', () => {
    expect(toFileUrl('C:\\docs\\img a.png')).toBe('file:///C:/docs/img%20a.png');
  });
  it('encodes #', () => {
    expect(toFileUrl('C:\\docs\\a#b.png')).toBe('file:///C:/docs/a%23b.png');
  });
  it('encodes %', () => {
    expect(toFileUrl('C:\\docs\\100%.png')).toBe('file:///C:/docs/100%25.png');
  });
  it('encodes non-ASCII characters', () => {
    expect(toFileUrl('C:\\docs\\café.png')).toBe('file:///C:/docs/caf%C3%A9.png');
  });
  it('turns a UNC path into a file:// host URL', () => {
    expect(toFileUrl('\\\\server\\share\\img.png')).toBe('file://server/share/img.png');
  });
});

describe('rewriteAssetUrls', () => {
  it('turns asset-protocol URLs into properly-encoded file:// URLs', () => {
    const html = '<img src="http://asset.localhost/C%3A%5Cdocs%5Cimg%20a.png" alt="">';
    expect(rewriteAssetUrls(html)).toBe('<img src="file:///C:/docs/img%20a.png" alt="">');
  });
  it('also rewrites the mdasset.localhost host', () => {
    const html = '<img src="http://mdasset.localhost/C%3A%5Cdocs%5Cimg.png" alt="">';
    expect(rewriteAssetUrls(html)).toBe('<img src="file:///C:/docs/img.png" alt="">');
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
      preset: BUILTIN_PRESETS.find((p) => p.id === 'builtin-claude')!,
      theme: 'dark',
    });
    expect(out).toContain('<title>A &quot;quoted&quot; &lt;title&gt;</title>');
    expect(out).toContain('data-theme="dark"');
    expect(out).toContain('--md-bg: #151515');
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
