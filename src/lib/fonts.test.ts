import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FONTS,
  filterFonts,
  fontStack,
  groupFonts,
  primaryFamily,
  resolveFamily,
  type FontFamily,
} from './fonts';

function font(over: Partial<FontFamily> & { family: string }): FontFamily {
  return {
    cssName: over.family,
    source: 'system',
    category: 'sans-serif',
    monospace: false,
    arabic: false,
    ...over,
  };
}

describe('BUILTIN_FONTS', () => {
  it('has 19 unique CSS names', () => {
    expect(BUILTIN_FONTS).toHaveLength(19);
    expect(new Set(BUILTIN_FONTS.map((f) => f.cssName)).size).toBe(19);
    expect(BUILTIN_FONTS.every((f) => f.source === 'builtin')).toBe(true);
  });

  it('keeps the three names existing presets use', () => {
    const names = BUILTIN_FONTS.map((f) => f.cssName);
    expect(names).toContain('Inter Variable');
    expect(names).toContain('Open Sans Variable');
    expect(names).toContain('JetBrains Mono Variable');
  });

  it('names static fonts without "Variable" and shows clean display names', () => {
    const lato = BUILTIN_FONTS.find((f) => f.family === 'Lato');
    expect(lato?.cssName).toBe('Lato');
    expect(BUILTIN_FONTS.every((f) => !f.family.includes('Variable'))).toBe(true);
  });

  it('flags the monospace and Arabic fonts', () => {
    expect(
      BUILTIN_FONTS.filter((f) => f.monospace)
        .map((f) => f.family)
        .sort(),
    ).toEqual(['Fira Code', 'IBM Plex Mono', 'JetBrains Mono', 'Source Code Pro']);
    expect(
      BUILTIN_FONTS.filter((f) => f.arabic)
        .map((f) => f.family)
        .sort(),
    ).toEqual(['IBM Plex Sans Arabic', 'Noto Naskh Arabic', 'Noto Sans Arabic']);
  });
});

describe('fontStack', () => {
  it('adds fallbacks by category', () => {
    expect(fontStack(font({ family: 'Inter', cssName: 'Inter Variable' }))).toBe(
      "'Inter Variable', 'Segoe UI', system-ui, sans-serif",
    );
    expect(fontStack(font({ family: 'Lora', category: 'serif' }))).toBe("'Lora', Georgia, serif");
    expect(fontStack(font({ family: 'Fira Code', category: 'monospace' }))).toBe(
      "'Fira Code', 'Cascadia Mono', Consolas, monospace",
    );
    expect(fontStack(font({ family: 'Pacifico', category: 'handwriting' }))).toBe(
      "'Pacifico', system-ui, sans-serif",
    );
    expect(fontStack(font({ family: 'Bungee', category: 'display' }))).toBe(
      "'Bungee', system-ui, sans-serif",
    );
  });

  it('puts the Segoe UI fallback after an Arabic sans family', () => {
    const arabic = BUILTIN_FONTS.find((f) => f.family === 'Noto Sans Arabic');
    expect(arabic && fontStack(arabic)).toBe(
      "'Noto Sans Arabic Variable', 'Segoe UI', system-ui, sans-serif",
    );
  });

  it('round-trips through primaryFamily', () => {
    for (const f of BUILTIN_FONTS) expect(primaryFamily(fontStack(f))).toBe(f.cssName);
  });
});

describe('primaryFamily', () => {
  it('returns the first family unquoted', () => {
    expect(primaryFamily("'Inter Variable', Inter, sans-serif")).toBe('Inter Variable');
    expect(primaryFamily('"Open Sans", sans-serif')).toBe('Open Sans');
    expect(primaryFamily('Georgia, serif')).toBe('Georgia');
  });

  it('trims extra spaces', () => {
    expect(primaryFamily("   'Lora'  ,serif")).toBe('Lora');
    expect(primaryFamily('  Consolas  ,  monospace ')).toBe('Consolas');
  });

  it('keeps commas inside quotes', () => {
    expect(primaryFamily("'Foo, Bar', serif")).toBe('Foo, Bar');
  });

  it('returns generic families as they are', () => {
    expect(primaryFamily('system-ui, sans-serif')).toBe('system-ui');
    expect(primaryFamily('monospace')).toBe('monospace');
  });

  it('returns null for an empty stack', () => {
    expect(primaryFamily('')).toBeNull();
    expect(primaryFamily('   ')).toBeNull();
    expect(primaryFamily("''")).toBeNull();
  });
});

describe('resolveFamily', () => {
  const sysInter = font({ family: 'Inter', source: 'system' });
  const google = font({ family: 'Literata', source: 'google', googleId: 'literata' });
  const downloaded = font({ family: 'Literata', source: 'google', googleId: 'literata-dl' });
  const system = font({ family: 'Cascadia Code', source: 'system', monospace: true });

  it('finds built-in fonts by CSS name or display name, ignoring case', () => {
    const lists = { builtin: BUILTIN_FONTS };
    expect(resolveFamily("'Inter Variable', sans-serif", lists)?.family).toBe('Inter');
    expect(resolveFamily('inter, sans-serif', lists)?.cssName).toBe('Inter Variable');
    expect(resolveFamily('"open sans variable"', lists)?.family).toBe('Open Sans');
  });

  it('prefers built-in, then downloaded, then system, then the Google catalogue', () => {
    const lists = {
      builtin: BUILTIN_FONTS,
      downloaded: [downloaded],
      system: [sysInter, system],
      google: [google],
    };
    expect(resolveFamily('Inter', lists)?.source).toBe('builtin');
    expect(resolveFamily('Literata', lists)).toBe(downloaded);
    expect(resolveFamily('Cascadia Code', lists)).toBe(system);
    expect(resolveFamily('Literata', { system: [], google: [google] })).toBe(google);
  });

  it('returns null for unknown, generic or empty stacks', () => {
    const lists = { builtin: BUILTIN_FONTS, system: [system] };
    expect(resolveFamily('Comic Sans MS, cursive', lists)).toBeNull();
    expect(resolveFamily('system-ui, sans-serif', lists)).toBeNull();
    expect(resolveFamily('', lists)).toBeNull();
    expect(resolveFamily('Inter', {})).toBeNull();
  });
});

describe('filterFonts', () => {
  const fonts = [
    font({ family: 'Fira Code', monospace: true, category: 'monospace' }),
    font({ family: 'Noto Sans Arabic', cssName: 'Noto Sans Arabic Variable', arabic: true }),
    font({ family: 'Lora', category: 'serif' }),
  ];
  const none = { query: '', monospaceOnly: false, arabicOnly: false };

  it('returns everything with no filters', () => {
    expect(filterFonts(fonts, none)).toEqual(fonts);
  });

  it('matches part of a name, ignoring case and outer spaces', () => {
    expect(filterFonts(fonts, { ...none, query: ' SANS ' }).map((f) => f.family)).toEqual([
      'Noto Sans Arabic',
    ]);
    expect(filterFonts(fonts, { ...none, query: 'or' }).map((f) => f.family)).toEqual(['Lora']);
    expect(filterFonts(fonts, { ...none, query: 'zzz' })).toEqual([]);
  });

  it('applies monospaceOnly and arabicOnly', () => {
    expect(filterFonts(fonts, { ...none, monospaceOnly: true }).map((f) => f.family)).toEqual([
      'Fira Code',
    ]);
    expect(filterFonts(fonts, { ...none, arabicOnly: true }).map((f) => f.family)).toEqual([
      'Noto Sans Arabic',
    ]);
    expect(filterFonts(fonts, { ...none, monospaceOnly: true, arabicOnly: true })).toEqual([]);
  });

  it('combines the query with the toggles', () => {
    expect(
      filterFonts(fonts, { query: 'code', monospaceOnly: true, arabicOnly: false }),
    ).toHaveLength(1);
    expect(filterFonts(fonts, { query: 'lora', monospaceOnly: true, arabicOnly: false })).toEqual(
      [],
    );
  });
});

describe('groupFonts', () => {
  it('orders groups built-in, system, Google and sorts A to Z inside each', () => {
    const groups = groupFonts([
      font({ family: 'Zilla', source: 'google' }),
      font({ family: 'Segoe UI', source: 'system' }),
      font({ family: 'Lora', source: 'builtin' }),
      font({ family: 'Arial', source: 'system' }),
      font({ family: 'Inter', source: 'builtin' }),
    ]);
    expect(groups.map((g) => g.source)).toEqual(['builtin', 'system', 'google']);
    expect(groups.map((g) => g.fonts.map((f) => f.family))).toEqual([
      ['Inter', 'Lora'],
      ['Arial', 'Segoe UI'],
      ['Zilla'],
    ]);
  });

  it('leaves out empty groups', () => {
    expect(groupFonts([])).toEqual([]);
    expect(groupFonts([font({ family: 'Zilla', source: 'google' })]).map((g) => g.source)).toEqual([
      'google',
    ]);
  });
});
