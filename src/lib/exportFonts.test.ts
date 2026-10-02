import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFontFile, type DownloadedFont } from '@/lib/tauri';
import { buildExportHtml } from '@/lib/export';
import { BUILTIN_PRESETS, type StylePreset } from '@/store/style';
import { useFontsStore } from '@/store/fonts';
import {
  collectFontFaceRules,
  firstUrl,
  fontFaceCss,
  fontsToEmbed,
  loadFontCss,
  selectBuiltinFaces,
  toBase64,
  type FaceDescriptor,
} from './exportFonts';

vi.mock('@/lib/tauri', () => ({
  readFontFile: vi.fn(),
  listDownloadedFonts: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: () => Promise.reject(new Error('no store')) }));

function preset(bodyFont: string, headingFont: string, monoFont: string): StylePreset {
  const base = BUILTIN_PRESETS[0];
  return { ...base, typography: { ...base.typography, bodyFont, headingFont, monoFont } };
}

function google(id: string, family: string, files = 1): DownloadedFont {
  return {
    id,
    family,
    category: 'serif',
    files: Array.from({ length: files }, (_, i) => ({
      file: `latin-${i}.woff2`,
      weight: '200 900',
      style: i === 0 ? 'normal' : 'italic',
      unicodeRange: i === 0 ? 'U+0000-00FF' : '',
    })),
  };
}

const face = (family: string, over: Partial<FaceDescriptor> = {}): FaceDescriptor => ({
  family,
  src: `/files/${family.replace(/ /g, '-')}.woff2`,
  weight: '400 700',
  style: 'normal',
  unicodeRange: 'U+0000-00FF',
  ...over,
});

describe('fontsToEmbed', () => {
  it('takes the first family of each stack, built-in and downloaded only', () => {
    const wanted = fontsToEmbed(
      preset("'Lora Variable', Georgia, serif", "'Literata', serif", "'Cascadia Code', monospace"),
      [google('literata', 'Literata')],
    );
    expect(wanted.builtin).toEqual(['Lora Variable']);
    expect(wanted.downloaded.map((f) => f.id)).toEqual(['literata']);
  });

  it('treats an empty heading stack as the body font, without duplicates', () => {
    const wanted = fontsToEmbed(preset("'Lora Variable', serif", '', "'Lora Variable', serif"), []);
    expect(wanted.builtin).toEqual(['Lora Variable']);
  });

  it('skips system fonts, generic families and unknown names', () => {
    const wanted = fontsToEmbed(preset('Segoe UI, sans-serif', 'serif', 'Nope Mono'), [
      google('literata', 'Literata'),
    ]);
    expect(wanted).toEqual({ builtin: [], downloaded: [] });
  });

  it('ignores a Google font that is not downloaded', () => {
    const wanted = fontsToEmbed(preset("'Literata', serif", '', 'monospace'), []);
    expect(wanted.downloaded).toEqual([]);
  });
});

describe('firstUrl', () => {
  it('reads quoted and bare urls', () => {
    expect(firstUrl('url("http://x/a.woff2") format("woff2")')).toBe('http://x/a.woff2');
    expect(firstUrl("url('/a b.woff2')")).toBe('/a b.woff2');
    expect(firstUrl('url(/a.woff2) format(woff2)')).toBe('/a.woff2');
  });
  it('returns null without a url', () => {
    expect(firstUrl('local(Arial)')).toBeNull();
  });
});

describe('selectBuiltinFaces', () => {
  it('keeps only the faces of the wanted families, case-insensitively', () => {
    const faces = [face('Lora Variable'), face('Inter Variable'), face('lora variable')];
    expect(selectBuiltinFaces(faces, ['Lora Variable']).map((f) => f.family)).toEqual([
      'Lora Variable',
      'lora variable',
    ]);
  });
});

describe('toBase64', () => {
  it('encodes small buffers', () => {
    expect(toBase64(new TextEncoder().encode('hello').buffer as ArrayBuffer)).toBe('aGVsbG8=');
  });
  it('handles buffers far larger than the argument limit', () => {
    const bytes = new Uint8Array(1_000_000).fill(65);
    const out = toBase64(bytes.buffer);
    expect(atob(out).length).toBe(1_000_000);
  });
});

describe('fontFaceCss', () => {
  it('builds a rule with the weight, style and unicode-range', () => {
    const css = fontFaceCss([face('Lora Variable', { src: 'data:font/woff2;base64,AAAA' })]);
    expect(css).toBe(
      "@font-face{font-family:'Lora Variable';font-style:normal;font-weight:400 700;" +
        "font-display:swap;src:url(data:font/woff2;base64,AAAA) format('woff2');" +
        'unicode-range:U+0000-00FF}',
    );
  });

  it('leaves out an empty unicode-range', () => {
    expect(fontFaceCss([face('Lora Variable', { unicodeRange: '' })])).not.toContain(
      'unicode-range',
    );
  });

  it('escapes quotes, backslashes and "<" in family names, and strips risky descriptor text', () => {
    const css = fontFaceCss([
      face("It's \\ </style>", {
        src: 'data:font/woff2;base64,AAAA',
        weight: '400;}body{x:y',
        unicodeRange: '',
      }),
    ]);
    expect(css).toContain("font-family:'It\\'s \\\\ \\3c /style>'");
    expect(css).not.toContain('</style');
    expect(css).toContain('font-weight:400bodyx:y');
    expect(css.match(/\{/g)).toHaveLength(1);
  });
});

describe('collectFontFaceRules', () => {
  // jsdom's CSSOM drops most @font-face descriptors, so the sheets here are plain objects.
  const fontRule = (props: Record<string, string>) => ({
    type: 5,
    style: { getPropertyValue: (name: string) => props[name] ?? '' },
  });
  const sheet = (rules: unknown[], href: string | null = 'http://app/assets/index.css') =>
    ({ href, cssRules: rules }) as unknown as CSSStyleSheet;

  it('reads @font-face rules and resolves relative urls against the sheet', () => {
    const rule = fontRule({
      'font-family': '"Lora Variable"',
      'font-style': 'italic',
      'font-weight': '400 700',
      src: 'url("../files/lora.woff2") format("woff2-variations")',
      'unicode-range': 'U+0000-00FF',
    });
    const found = collectFontFaceRules([sheet([{ type: 1 }, rule])]);
    expect(found).toEqual([
      {
        family: 'Lora Variable',
        src: 'http://app/files/lora.woff2',
        weight: '400 700',
        style: 'italic',
        unicodeRange: 'U+0000-00FF',
      },
    ]);
  });

  it('keeps data: urls, and finds rules inside @media', () => {
    const rule = fontRule({ 'font-family': 'Inter', src: 'url(data:font/woff2;base64,AAAA)' });
    const found = collectFontFaceRules([sheet([{ type: 4, cssRules: [rule] }])]);
    expect(found.map((f) => f.src)).toEqual(['data:font/woff2;base64,AAAA']);
  });

  it('skips rules without a family or url', () => {
    const rules = [fontRule({ src: 'url(/a.woff2)' }), fontRule({ 'font-family': 'X' })];
    expect(collectFontFaceRules([sheet(rules)])).toEqual([]);
  });

  it('skips a sheet whose rules cannot be read', () => {
    const blocked = {
      href: null,
      get cssRules(): CSSRuleList {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as CSSStyleSheet;
    expect(collectFontFaceRules([blocked])).toEqual([]);
  });
});

describe('loadFontCss and buildExportHtml', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(readFontFile)
      .mockReset()
      .mockResolvedValue(new Uint8Array([4, 5, 6]).buffer);
    useFontsStore.setState({ downloaded: [], downloadedLoaded: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const pageFaces = () => [
    face('Lora Variable', { src: 'http://app/lora-latin.woff2' }),
    face('Lora Variable', { src: 'http://app/lora-ext.woff2', style: 'italic' }),
    face('Inter Variable', { src: 'http://app/inter.woff2' }),
  ];

  it('embeds only the built-in body font; the system code font is left to fall back', async () => {
    const p = preset("'Lora Variable', Georgia, serif", '', "'Cascadia Code', monospace");
    const fontCss = await loadFontCss(p, pageFaces);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://app/lora-latin.woff2',
      'http://app/lora-ext.woff2',
    ]);
    const html = buildExportHtml({
      title: 't',
      bodyHtml: '<p>hi</p>',
      preset: p,
      theme: 'light',
      fontCss,
    });
    expect(html.match(/@font-face/g)).toHaveLength(2);
    expect(html).toContain("font-family:'Lora Variable'");
    expect(html).toContain('data:font/woff2;base64,AQID');
    expect(html).not.toContain('Inter Variable');
    expect(html).not.toContain("font-family:'Cascadia Code'");
    expect(html.indexOf('@font-face')).toBeLessThan(html.indexOf('/* preset */'));
  });

  it('embeds a downloaded Google font from its manifest files', async () => {
    useFontsStore.setState({
      downloaded: [google('literata', 'Literata', 2)],
      downloadedLoaded: true,
    });
    const css = await loadFontCss(preset("'Literata', serif", '', 'monospace'), pageFaces);
    expect(readFontFile).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain("font-family:'Literata'");
    expect(css).toContain('font-style:italic');
    expect(css).toContain('unicode-range:U+0000-00FF');
    expect(css).toContain('data:font/woff2;base64,BAUG');
  });

  it('skips a face that cannot be read and still embeds the rest', async () => {
    useFontsStore.setState({
      downloaded: [google('literata', 'Literata', 2)],
      downloadedLoaded: true,
    });
    vi.mocked(readFontFile).mockRejectedValueOnce('gone');
    const css = await loadFontCss(preset("'Literata', serif", '', 'monospace'), pageFaces);
    expect(css.match(/@font-face/g)).toHaveLength(1);
  });

  it('skips a built-in face that fails to load', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });
    const css = await loadFontCss(preset("'Lora Variable', serif", '', 'monospace'), pageFaces);
    expect(css.match(/@font-face/g)).toHaveLength(1);
  });

  it('returns nothing, and does not throw, when reading the page fails', async () => {
    const css = await loadFontCss(preset("'Lora Variable', serif", '', 'monospace'), () => {
      throw new Error('boom');
    });
    expect(css).toBe('');
  });

  it('adds no font CSS when none is given (self-contained export off)', () => {
    const html = buildExportHtml({
      title: 't',
      bodyHtml: '<p>hi</p>',
      preset: preset("'Lora Variable', serif", '', 'monospace'),
      theme: 'light',
    });
    expect(html).not.toContain('@font-face');
    expect(html).not.toContain('/* fonts */');
  });
});
