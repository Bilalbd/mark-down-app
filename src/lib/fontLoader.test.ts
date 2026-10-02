import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFontFile, type DownloadedFont } from '@/lib/tauri';
import { registerDownloadedFont, unregisterDownloadedFont } from './fontLoader';

vi.mock('@/lib/tauri', () => ({ readFontFile: vi.fn() }));

const faces: FakeFace[] = [];
let failLoadFor: string | null = null;

class FakeFace {
  constructor(
    public family: string,
    public source: ArrayBuffer,
    public descriptors: FontFaceDescriptors,
  ) {
    faces.push(this);
  }
  load() {
    return failLoadFor === this.family
      ? Promise.reject(new Error('bad font'))
      : Promise.resolve(this);
  }
}

const added = new Set<unknown>();

const FONT: DownloadedFont = {
  id: 'literata',
  family: 'Literata',
  category: 'serif',
  files: [
    {
      file: 'latin-wght-normal.woff2',
      weight: '200 900',
      style: 'normal',
      unicodeRange: 'U+0000-00FF',
    },
    { file: 'latin-wght-italic.woff2', weight: '200 900', style: 'italic', unicodeRange: '' },
  ],
};

describe('registerDownloadedFont', () => {
  beforeEach(() => {
    faces.length = 0;
    added.clear();
    failLoadFor = null;
    vi.mocked(readFontFile).mockReset();
    vi.mocked(readFontFile).mockResolvedValue(new ArrayBuffer(4));
    vi.stubGlobal('FontFace', FakeFace);
    Object.defineProperty(document, 'fonts', {
      value: { add: (f: unknown) => added.add(f), delete: (f: unknown) => added.delete(f) },
      configurable: true,
    });
  });

  afterEach(() => {
    unregisterDownloadedFont('literata');
    vi.unstubAllGlobals();
  });

  it('adds one FontFace per file with its weight, style and range', async () => {
    await registerDownloadedFont(FONT);
    expect(vi.mocked(readFontFile).mock.calls).toEqual([
      ['literata', 'latin-wght-normal.woff2'],
      ['literata', 'latin-wght-italic.woff2'],
    ]);
    expect(faces.map((f) => f.family)).toEqual(['Literata', 'Literata']);
    expect(faces[0].descriptors).toEqual({
      weight: '200 900',
      style: 'normal',
      unicodeRange: 'U+0000-00FF',
    });
    expect(faces[1].descriptors).toEqual({ weight: '200 900', style: 'italic' });
    expect(added.size).toBe(2);
  });

  it('registers a font once per session', async () => {
    await Promise.all([registerDownloadedFont(FONT), registerDownloadedFont(FONT)]);
    await registerDownloadedFont(FONT);
    expect(faces).toHaveLength(2);
    expect(added.size).toBe(2);
  });

  it('keeps the files that load when one fails', async () => {
    vi.mocked(readFontFile).mockRejectedValueOnce('missing file');
    await expect(registerDownloadedFont(FONT)).resolves.toBeUndefined();
    expect(added.size).toBe(1);
  });

  it('rejects when no file loads, and a later call tries again', async () => {
    vi.mocked(readFontFile).mockRejectedValue('missing file');
    await expect(registerDownloadedFont(FONT)).rejects.toThrow('missing file');
    expect(added.size).toBe(0);

    vi.mocked(readFontFile).mockResolvedValue(new ArrayBuffer(4));
    await registerDownloadedFont(FONT);
    expect(added.size).toBe(2);
  });

  it('rejects when the font data cannot be parsed', async () => {
    failLoadFor = 'Literata';
    await expect(registerDownloadedFont(FONT)).rejects.toThrow('bad font');
    expect(added.size).toBe(0);
  });
});

describe('unregisterDownloadedFont', () => {
  beforeEach(() => {
    faces.length = 0;
    added.clear();
    failLoadFor = null;
    vi.mocked(readFontFile).mockResolvedValue(new ArrayBuffer(4));
    vi.stubGlobal('FontFace', FakeFace);
    Object.defineProperty(document, 'fonts', {
      value: { add: (f: unknown) => added.add(f), delete: (f: unknown) => added.delete(f) },
      configurable: true,
    });
  });

  afterEach(() => {
    unregisterDownloadedFont('literata');
    vi.unstubAllGlobals();
  });

  it('removes the faces at once and lets the font be registered again', async () => {
    await registerDownloadedFont(FONT);
    unregisterDownloadedFont('literata');
    expect(added.size).toBe(0);

    await registerDownloadedFont(FONT);
    expect(added.size).toBe(2);
  });

  it('adds nothing for a font removed while its files are still loading', async () => {
    const pending = registerDownloadedFont(FONT);
    unregisterDownloadedFont('literata');
    await pending;
    expect(added.size).toBe(0);
  });

  it('ignores a font that was never registered', () => {
    expect(() => unregisterDownloadedFont('nothing')).not.toThrow();
  });
});
