import { describe, expect, it } from 'vitest';
import css from './fonts.css?raw';
import { BUILTIN_FONTS } from '@/lib/fonts';

interface Face {
  family: string;
  subset: string;
}

/** Each @font-face in the generated CSS: its family and the subset named in its file. */
function parseFaces(source: string): Face[] {
  return (source.match(/@font-face\s*\{[^}]*\}/g) ?? []).map((block) => {
    const family = /font-family:\s*'([^']+)'/.exec(block)?.[1] ?? '';
    const file = /files\/([^)]+)\.woff2/.exec(block)?.[1] ?? '';
    const name = file.replace(/-(?:wght|\d+)-(?:normal|italic)$/, '');
    const subset = ['latin-ext', 'latin', 'arabic'].find((s) => name.endsWith(`-${s}`));
    return { family, subset: subset ?? name };
  });
}

describe('generated fonts.css', () => {
  const faces = parseFaces(css);

  it('has a @font-face for every built-in font, under its exact CSS name', () => {
    for (const font of BUILTIN_FONTS) {
      expect(
        faces.some((f) => f.family === font.cssName),
        font.cssName,
      ).toBe(true);
    }
  });

  it('declares no family that is not a built-in font', () => {
    const known = new Set(BUILTIN_FONTS.map((f) => f.cssName));
    for (const face of faces) expect(known.has(face.family), face.family).toBe(true);
  });

  it('only references the latin, latin-ext and arabic subsets', () => {
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) {
      expect(['latin', 'latin-ext', 'arabic'], `${face.family} ${face.subset}`).toContain(
        face.subset,
      );
    }
  });

  it('has latin and latin-ext faces for every font', () => {
    for (const font of BUILTIN_FONTS) {
      const subsets = faces.filter((f) => f.family === font.cssName).map((f) => f.subset);
      expect(subsets, font.cssName).toContain('latin');
      expect(subsets, font.cssName).toContain('latin-ext');
    }
  });

  it('has arabic faces for the Arabic fonts and only for them', () => {
    for (const font of BUILTIN_FONTS) {
      const hasArabic = faces.some((f) => f.family === font.cssName && f.subset === 'arabic');
      expect(hasArabic, font.cssName).toBe(font.arabic);
    }
  });

  it('keeps unicode-range and font-display: swap on every face', () => {
    const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      expect(block).toContain('font-display: swap');
      expect(block).toContain('unicode-range:');
    }
  });
});
