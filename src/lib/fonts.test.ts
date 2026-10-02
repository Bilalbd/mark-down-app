import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FONTS,
  buildPickerRows,
  catalogToFamilies,
  downloadedForStacks,
  downloadedToFamilies,
  excludeBuiltin,
  excludeNamed,
  filterFonts,
  fontStack,
  googleFamilies,
  groupFonts,
  isCustomStack,
  isGenericFamily,
  missingGoogleFonts,
  primaryFamily,
  resolveFamily,
  stacksUseFamily,
  systemFontsToFamilies,
  type FontFamily,
} from './fonts';
import type { CatalogFont, DownloadedFont } from './tauri';

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

describe('systemFontsToFamilies', () => {
  it('maps each installed font to a system entry with the right category', () => {
    const result = systemFontsToFamilies([
      { family: 'Cascadia Code', monospace: true, arabic: false },
      { family: 'Segoe UI', monospace: false, arabic: true },
    ]);
    expect(result).toEqual([
      {
        family: 'Cascadia Code',
        cssName: 'Cascadia Code',
        source: 'system',
        category: 'monospace',
        monospace: true,
        arabic: false,
      },
      {
        family: 'Segoe UI',
        cssName: 'Segoe UI',
        source: 'system',
        category: 'sans-serif',
        monospace: false,
        arabic: true,
      },
    ]);
  });

  it('gives an empty list for no fonts', () => {
    expect(systemFontsToFamilies([])).toEqual([]);
  });
});

describe('excludeBuiltin', () => {
  it('hides installed fonts that are also bundled, by family or CSS name, ignoring case', () => {
    const result = excludeBuiltin([
      font({ family: 'JetBrains Mono' }),
      font({ family: 'inter' }),
      font({ family: 'Open Sans Variable' }),
      font({ family: 'Cascadia Code' }),
    ]);
    expect(result.map((f) => f.family)).toEqual(['Cascadia Code']);
  });
});

describe('isGenericFamily / isCustomStack', () => {
  it('recognises CSS generic keywords', () => {
    expect(isGenericFamily('serif')).toBe(true);
    expect(isGenericFamily(' System-UI ')).toBe(true);
    expect(isGenericFamily('Georgia')).toBe(false);
  });

  it('treats a stack starting with a generic keyword as custom', () => {
    expect(isCustomStack('monospace')).toBe(true);
    expect(isCustomStack('ui-sans-serif, Arial')).toBe(true);
  });

  it('keeps named families, blank stacks and unknown names in the picker', () => {
    expect(isCustomStack("'Inter Variable', sans-serif")).toBe(false);
    expect(isCustomStack('Charter, Georgia, serif')).toBe(false);
    expect(isCustomStack('')).toBe(false);
    expect(isCustomStack("''")).toBe(true);
  });
});

describe('buildPickerRows', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => font({ family: `Font ${String(i).padStart(3, '0')}` }));
  const labels = (rows: ReturnType<typeof buildPickerRows>) =>
    rows.map((r) => (r.type === 'option' ? r.option.key : r.key));

  it('lists Same as body first, then groups, the Google status line and the custom row', () => {
    const rows = buildPickerRows({
      groups: groupFonts([font({ family: 'Lora', source: 'builtin' }), font({ family: 'Arial' })]),
      searching: false,
      allowSame: true,
      expanded: [],
      googleNote: 'Loading Google Fonts…',
    });
    expect(labels(rows)).toEqual([
      'same',
      'header:builtin',
      'font:builtin:Lora',
      'header:system',
      'font:system:Arial',
      'header:google',
      'note:google',
      'custom',
    ]);
  });

  it('adds no Google header without a status line, and drops Same as body while searching', () => {
    const rows = buildPickerRows({
      groups: groupFonts([font({ family: 'Arial' })]),
      searching: true,
      allowSame: true,
      expanded: [],
    });
    expect(labels(rows)).toEqual(['header:system', 'font:system:Arial', 'custom']);
  });

  it('caps a long group with a Show all row that expands it', () => {
    const groups = groupFonts(many(120));
    const input = { groups, searching: false, allowSame: false, expanded: [] };
    const capped = buildPickerRows(input);
    expect(capped.filter((r) => r.type === 'option' && r.option.kind === 'font')).toHaveLength(50);
    const more = capped.find((r) => r.type === 'option' && r.option.kind === 'more');
    expect(more).toMatchObject({ option: { total: 120, next: 'font:system:Font 050' } });

    const all = buildPickerRows({ ...input, expanded: ['system'] });
    expect(all.filter((r) => r.type === 'option' && r.option.kind === 'font')).toHaveLength(120);
    expect(all.some((r) => r.type === 'option' && r.option.kind === 'more')).toBe(false);
  });

  it('caps search results at a larger limit', () => {
    const rows = buildPickerRows({
      groups: groupFonts(many(300)),
      searching: true,
      allowSame: false,
      expanded: [],
    });
    expect(rows.filter((r) => r.type === 'option' && r.option.kind === 'font')).toHaveLength(200);
  });

  it('puts the status line at the end of an existing Google group', () => {
    const rows = buildPickerRows({
      groups: groupFonts([font({ family: 'Literata', source: 'google', downloaded: true })]),
      searching: true,
      allowSame: false,
      expanded: [],
      googleNote: 'Needs an internet connection to add Google fonts',
    });
    expect(labels(rows)).toEqual([
      'header:google',
      'font:google:Literata',
      'note:google',
      'custom',
    ]);
  });
});

const CATALOG: CatalogFont[] = [
  {
    id: 'literata',
    family: 'Literata',
    category: 'serif',
    subsets: ['latin', 'latin-ext'],
    weights: [400],
    styles: ['normal'],
    variable: true,
  },
  {
    id: 'amiri',
    family: 'Amiri',
    category: 'serif',
    subsets: ['arabic', 'latin'],
    weights: [400],
    styles: ['normal'],
    variable: false,
  },
  {
    id: 'space-mono',
    family: 'Space Mono',
    category: 'monospace',
    subsets: ['latin'],
    weights: [400],
    styles: ['normal'],
    variable: false,
  },
  {
    id: 'weird',
    family: 'Weird',
    category: 'something-new',
    subsets: [],
    weights: [],
    styles: [],
    variable: false,
  },
];

const DOWNLOADED: DownloadedFont[] = [
  {
    id: 'literata',
    family: 'Literata',
    category: 'serif',
    files: [
      { file: 'latin-wght-normal.woff2', weight: '200 900', style: 'normal', unicodeRange: '' },
    ],
  },
  {
    id: 'amiri',
    family: 'Amiri',
    category: 'serif',
    files: [
      { file: 'latin-400-normal.woff2', weight: '400', style: 'normal', unicodeRange: '' },
      { file: 'arabic-400-normal.woff2', weight: '400', style: 'normal', unicodeRange: '' },
    ],
  },
];

describe('catalogToFamilies', () => {
  it('maps the catalogue to Google entries with category, monospace and Arabic', () => {
    const [literata, amiri, mono, weird] = catalogToFamilies(CATALOG);
    expect(literata).toEqual({
      family: 'Literata',
      cssName: 'Literata',
      source: 'google',
      category: 'serif',
      monospace: false,
      arabic: false,
      googleId: 'literata',
    });
    expect(amiri.arabic).toBe(true);
    expect(mono.monospace).toBe(true);
    expect(mono.category).toBe('monospace');
    expect(weird.category).toBe('sans-serif');
  });
});

describe('downloadedToFamilies', () => {
  it('marks entries as downloaded and finds Arabic from the files', () => {
    const [literata, amiri] = downloadedToFamilies(DOWNLOADED);
    expect(literata).toMatchObject({ googleId: 'literata', downloaded: true, arabic: false });
    expect(amiri.arabic).toBe(true);
  });
});

describe('excludeNamed', () => {
  it('drops fonts matching a taken family or CSS name, ignoring case', () => {
    const taken = [font({ family: 'Lora', cssName: 'Lora Variable', source: 'builtin' })];
    const fonts = [
      font({ family: 'lora' }),
      font({ family: 'LORA VARIABLE' }),
      font({ family: 'Amiri' }),
    ];
    expect(excludeNamed(fonts, taken).map((f) => f.family)).toEqual(['Amiri']);
  });
});

describe('googleFamilies', () => {
  const catalog = catalogToFamilies([
    ...CATALOG,
    { ...CATALOG[0], id: 'lora', family: 'lora' },
    { ...CATALOG[0], id: 'arial', family: 'ARIAL' },
  ]);

  it('lists downloaded fonts first and each font once, by priority', () => {
    const list = googleFamilies({
      catalog,
      downloaded: downloadedToFamilies([DOWNLOADED[0]]),
      builtin: BUILTIN_FONTS,
      system: [font({ family: 'Arial' })],
    });
    const names = list.map((f) => f.family);
    expect(names[0]).toBe('Literata');
    expect(names.filter((n) => n === 'Literata')).toHaveLength(1);
    expect(list[0].downloaded).toBe(true);
    expect(names).toContain('Amiri');
    expect(names.map((n) => n.toLowerCase())).not.toContain('lora');
    expect(names.map((n) => n.toLowerCase())).not.toContain('arial');
  });

  it('works with the catalogue unavailable', () => {
    const list = googleFamilies({
      catalog: [],
      downloaded: downloadedToFamilies(DOWNLOADED),
      builtin: BUILTIN_FONTS,
      system: [],
    });
    expect(list.map((f) => f.family)).toEqual(['Literata', 'Amiri']);
  });
});

describe('groupFonts with downloaded Google fonts', () => {
  it('puts downloaded fonts first inside the Google group', () => {
    const groups = groupFonts([
      font({ family: 'Aaa', source: 'google' }),
      font({ family: 'Zzz', source: 'google', downloaded: true }),
      font({ family: 'Bbb', source: 'google', downloaded: true }),
    ]);
    expect(groups[0].fonts.map((f) => f.family)).toEqual(['Bbb', 'Zzz', 'Aaa']);
  });
});

describe('stacksUseFamily', () => {
  it('compares the first family of each stack, ignoring case', () => {
    expect(stacksUseFamily(["'Literata', serif", ''], 'literata')).toBe(true);
    expect(stacksUseFamily(["Georgia, 'Literata'"], 'Literata')).toBe(false);
    expect(stacksUseFamily([''], 'Literata')).toBe(false);
  });
});

describe('downloadedForStacks', () => {
  it('picks the downloaded fonts the stacks start with', () => {
    const stacks = ["'Literata', serif", '', "'Inter Variable', sans-serif"];
    expect(downloadedForStacks(stacks, DOWNLOADED).map((f) => f.id)).toEqual(['literata']);
    expect(downloadedForStacks(['Georgia, serif'], DOWNLOADED)).toEqual([]);
  });
});

describe('missingGoogleFonts', () => {
  const lists = {
    builtin: BUILTIN_FONTS,
    downloaded: downloadedToFamilies([DOWNLOADED[0]]),
    system: [font({ family: 'Consolas' })],
    google: catalogToFamilies(CATALOG),
  };

  it('finds Google fonts that only the catalogue provides, once each', () => {
    const stacks = ["'Amiri', serif", 'Amiri, serif', "'Space Mono', monospace"];
    expect(missingGoogleFonts(stacks, lists).map((f) => f.googleId)).toEqual([
      'amiri',
      'space-mono',
    ]);
  });

  it('ignores fonts that are built in, downloaded, installed, unknown or generic', () => {
    const stacks = ["'Inter Variable'", "'Literata'", 'Consolas', 'Charter, serif', 'serif', ''];
    expect(missingGoogleFonts(stacks, lists)).toEqual([]);
  });
});
