import { describe, expect, it } from 'vitest';
import {
  assetPaths,
  buildExportHtml,
  inlineKatexFonts,
  replaceAssetUrls,
  rewriteAssetUrls,
  stripCursorMark,
  toFileUrl,
} from './export';
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

describe('assetPaths', () => {
  it('extracts local asset paths', () => {
    const html =
      '<img src="http://mdasset.localhost/C%3A%5Cdocs%5Ca.png"><img src="http://asset.localhost/b.jpg">';
    const paths = assetPaths(html);
    expect(paths).toContain('C:\\docs\\a.png');
    expect(paths).toContain('b.jpg');
  });
  it('deduplicates paths', () => {
    const html =
      '<img src="http://mdasset.localhost/x.png"><img src="http://asset.localhost/x.png">';
    expect(assetPaths(html)).toHaveLength(1);
  });
  it('ignores non-asset URLs', () => {
    const html = '<img src="https://example.com/x.png"><a href="http://example.com/">x</a>';
    expect(assetPaths(html)).toHaveLength(0);
  });
});

describe('replaceAssetUrls', () => {
  it('swaps asset URLs with map entries', () => {
    const html = '<img src="http://mdasset.localhost/img.png" alt="">';
    const urls = new Map([['img.png', 'data:image/png;base64,abc123']]);
    const result = replaceAssetUrls(html, urls);
    expect(result).toContain('data:image/png;base64,abc123');
  });
  it('falls back to file:// URL when not in map', () => {
    const html = '<img src="http://mdasset.localhost/C%3A%5Cdocs%5Cimg.png" alt="">';
    const urls = new Map();
    const result = replaceAssetUrls(html, urls);
    expect(result).toContain('file:///C:/docs/img.png');
  });
});

describe('inlineKatexFonts', () => {
  it('replaces font-face src with data: URLs', () => {
    const css = `@font-face{font-family:KaTeX_Main;src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff")}`;
    const fonts = new Map([['KaTeX_Main-Regular.woff2', 'data:font/woff2;base64,xyz']]);
    const result = inlineKatexFonts(css, fonts);
    expect(result).toContain('src:url(data:font/woff2;base64,xyz) format("woff2")');
    expect(result).not.toContain('woff2) format');
  });
  it('leaves font-faces unchanged if woff2 is not in the map', () => {
    const css = `@font-face{src:url(fonts/Unknown.woff2) format("woff2")}`;
    const fonts = new Map();
    const result = inlineKatexFonts(css, fonts);
    expect(result).toBe(css);
  });
  it('keeps consecutive minified rules intact (src is the last declaration before `}`)', () => {
    const rule = (name: string) =>
      `@font-face{font-display:block;font-family:${name};font-style:normal;font-weight:400;` +
      `src:url(fonts/${name}.woff2) format("woff2"),url(fonts/${name}.woff) format("woff"),` +
      `url(fonts/${name}.ttf) format("truetype")}`;
    const css = rule('KaTeX_AMS') + rule('KaTeX_Main');
    const fonts = new Map([
      ['KaTeX_AMS.woff2', 'data:font/woff2;base64,AAA'],
      ['KaTeX_Main.woff2', 'data:font/woff2;base64,BBB'],
    ]);
    const result = inlineKatexFonts(css, fonts);
    expect(result).toBe(
      '@font-face{font-display:block;font-family:KaTeX_AMS;font-style:normal;font-weight:400;' +
        'src:url(data:font/woff2;base64,AAA) format("woff2")}' +
        '@font-face{font-display:block;font-family:KaTeX_Main;font-style:normal;font-weight:400;' +
        'src:url(data:font/woff2;base64,BBB) format("woff2")}',
    );
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
  it('inlines KaTeX CSS when provided, without linking CDN', async () => {
    const { html: body } = await renderMarkdown('$x^2$');
    const out = buildExportHtml({
      title: 't',
      bodyHtml: body,
      preset: BUILTIN_PRESETS[0],
      theme: 'light',
      katexCss: '@font-face{font-family:KaTeX_Main}',
    });
    expect(out).not.toContain('katex.min.css');
    expect(out).toContain('@font-face{font-family:KaTeX_Main}');
  });
});

describe('stripCursorMark', () => {
  it('removes the is-cursor-block class', () => {
    const html = '<p class="is-cursor-block">text</p>';
    expect(stripCursorMark(html)).toBe('<p>text</p>');
  });
  it('keeps other classes when removing is-cursor-block', () => {
    const html = '<p class="foo is-cursor-block bar">text</p>';
    const result = stripCursorMark(html);
    expect(result).toContain('class="foo bar"');
    expect(result).not.toContain('is-cursor-block');
  });
  it('removes the empty class attribute after stripping is-cursor-block', () => {
    const html = '<div class="is-cursor-block"></div>';
    expect(stripCursorMark(html)).toBe('<div></div>');
  });
  it('leaves elements without the class unchanged', () => {
    const html = '<p>text</p><div>content</div>';
    expect(stripCursorMark(html)).toBe(html);
  });
  it('handles nested elements with the class', () => {
    const html = '<div class="is-cursor-block"><p class="foo">text</p></div>';
    const result = stripCursorMark(html);
    expect(result).not.toContain('is-cursor-block');
    expect(result).toContain('class="foo"');
  });
});
