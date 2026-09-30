import type { SystemFont } from '@/lib/tauri';

/** Where a font comes from: shipped with the app, installed on this PC, or a Google font. */
export type FontSource = 'builtin' | 'system' | 'google';

export type FontCategory = 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting';

export interface FontFamily {
  /** Display name shown in the picker (no "Variable"). */
  family: string;
  /** Name used in CSS `font-family`. */
  cssName: string;
  source: FontSource;
  category: FontCategory;
  monospace: boolean;
  arabic: boolean;
  /** Fontsource id for Google fonts, e.g. `source-serif-4`. */
  googleId?: string;
}

/** The lists `resolveFamily` searches, in the order it searches them (built-in first). */
export interface FontLists {
  builtin?: FontFamily[];
  downloaded?: FontFamily[];
  system?: FontFamily[];
  google?: FontFamily[];
}

export interface FontFilter {
  query: string;
  monospaceOnly: boolean;
  arabicOnly: boolean;
}

export interface FontGroup {
  source: FontSource;
  fonts: FontFamily[];
}

interface BuiltinSpec {
  family: string;
  /** Whether Fontsource ships it as a variable font, which decides the CSS name. */
  variable: boolean;
  category: FontCategory;
  arabic?: boolean;
}

// Variable fonts get Fontsource's "<Family> Variable" CSS name, static ones the plain name. The
// first three keep the names existing presets use.
const BUILTIN_SPECS: BuiltinSpec[] = [
  { family: 'Inter', variable: true, category: 'sans-serif' },
  { family: 'Open Sans', variable: true, category: 'sans-serif' },
  { family: 'JetBrains Mono', variable: true, category: 'monospace' },
  { family: 'Roboto', variable: true, category: 'sans-serif' },
  { family: 'Noto Sans', variable: true, category: 'sans-serif' },
  { family: 'Source Sans 3', variable: true, category: 'sans-serif' },
  { family: 'Lato', variable: false, category: 'sans-serif' },
  { family: 'Atkinson Hyperlegible Next', variable: true, category: 'sans-serif' },
  { family: 'Merriweather', variable: true, category: 'serif' },
  { family: 'Lora', variable: true, category: 'serif' },
  { family: 'Source Serif 4', variable: true, category: 'serif' },
  { family: 'Montserrat', variable: true, category: 'sans-serif' },
  { family: 'Playfair Display', variable: true, category: 'serif' },
  { family: 'Fira Code', variable: true, category: 'monospace' },
  { family: 'Source Code Pro', variable: true, category: 'monospace' },
  { family: 'IBM Plex Mono', variable: false, category: 'monospace' },
  { family: 'Noto Sans Arabic', variable: true, category: 'sans-serif', arabic: true },
  { family: 'Noto Naskh Arabic', variable: true, category: 'serif', arabic: true },
  { family: 'IBM Plex Sans Arabic', variable: false, category: 'sans-serif', arabic: true },
];

/** The fonts bundled with the app. */
export const BUILTIN_FONTS: FontFamily[] = BUILTIN_SPECS.map((s) => ({
  family: s.family,
  cssName: s.variable ? `${s.family} Variable` : s.family,
  source: 'builtin',
  category: s.category,
  monospace: s.category === 'monospace',
  arabic: s.arabic ?? false,
}));

const FALLBACKS: Record<FontCategory, string> = {
  'sans-serif': "'Segoe UI', system-ui, sans-serif",
  serif: 'Georgia, serif',
  monospace: "'Cascadia Mono', Consolas, monospace",
  display: 'system-ui, sans-serif',
  handwriting: 'system-ui, sans-serif',
};

/** The CSS `font-family` value the picker writes: the font, then fallbacks for its category. */
export function fontStack(font: FontFamily): string {
  return `'${font.cssName.replace(/'/g, "\\'")}', ${FALLBACKS[font.category]}`;
}

/** The first family in a CSS font-family stack, unquoted and trimmed; null if there is none. */
export function primaryFamily(stack: string): string | null {
  const s = stack.trim();
  if (!s) return null;
  const quote = s[0];
  let name: string;
  if (quote === "'" || quote === '"') {
    let out = '';
    let i = 1;
    while (i < s.length && s[i] !== quote) {
      if (s[i] === '\\' && i + 1 < s.length) i++;
      out += s[i];
      i++;
    }
    name = out;
  } else {
    const comma = s.indexOf(',');
    name = comma === -1 ? s : s.slice(0, comma);
  }
  name = name.trim();
  return name || null;
}

/**
 * Finds the font a stack starts with. Searches built-in, downloaded Google, system, then the
 * Google catalogue, matching `cssName` or `family` case-insensitively.
 */
export function resolveFamily(stack: string, lists: FontLists): FontFamily | null {
  const name = primaryFamily(stack)?.toLowerCase();
  if (!name) return null;
  const ordered = [lists.builtin, lists.downloaded, lists.system, lists.google];
  for (const list of ordered) {
    const hit = list?.find(
      (f) => f.cssName.toLowerCase() === name || f.family.toLowerCase() === name,
    );
    if (hit) return hit;
  }
  return null;
}

/** Applies the picker's search box and its monospace / Arabic filters. */
export function filterFonts(fonts: FontFamily[], filter: FontFilter): FontFamily[] {
  const q = filter.query.trim().toLowerCase();
  return fonts.filter(
    (f) =>
      (!filter.monospaceOnly || f.monospace) &&
      (!filter.arabicOnly || f.arabic) &&
      (!q || f.family.toLowerCase().includes(q) || f.cssName.toLowerCase().includes(q)),
  );
}

/** Turns DirectWrite's list into picker entries: monospace or sans-serif, `cssName` = the family. */
export function systemFontsToFamilies(list: SystemFont[]): FontFamily[] {
  return list.map((f) => ({
    family: f.family,
    cssName: f.family,
    source: 'system',
    category: f.monospace ? 'monospace' : 'sans-serif',
    monospace: f.monospace,
    arabic: f.arabic,
  }));
}

/**
 * Drops installed fonts that are also bundled (by family or CSS name, case-insensitively), so a
 * font like JetBrains Mono appears once, under Built in.
 */
export function excludeBuiltin(
  system: FontFamily[],
  builtin: FontFamily[] = BUILTIN_FONTS,
): FontFamily[] {
  const taken = new Set(builtin.flatMap((f) => [f.family.toLowerCase(), f.cssName.toLowerCase()]));
  return system.filter(
    (f) => !taken.has(f.family.toLowerCase()) && !taken.has(f.cssName.toLowerCase()),
  );
}

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/** Whether `name` is a CSS generic family keyword such as `serif` or `system-ui`. */
export function isGenericFamily(name: string): boolean {
  return GENERIC_FAMILIES.has(name.trim().toLowerCase());
}

/**
 * Whether a stack can't be shown as a single font in the picker: it starts with a generic keyword
 * (or can't be parsed), so the control opens in free-text mode. A blank stack is not custom.
 */
export function isCustomStack(stack: string): boolean {
  if (!stack.trim()) return false;
  const name = primaryFamily(stack);
  return name === null || isGenericFamily(name);
}

export const SOURCE_LABELS: Record<FontSource, string> = {
  builtin: 'Built in',
  system: 'On this PC',
  google: 'Google Fonts',
};

/** Rows shown per group before a "Show all" row, without and with a search query. */
export const GROUP_CAP = 50;
export const GROUP_CAP_SEARCHING = 200;

export type PickerOption =
  | { key: string; kind: 'same' }
  | { key: string; kind: 'font'; font: FontFamily }
  /** `next` is the key of the first row the expansion reveals. */
  | { key: string; kind: 'more'; source: FontSource; total: number; next: string }
  | { key: string; kind: 'custom' };

export type PickerRow =
  | { type: 'header'; key: string; source: FontSource }
  | { type: 'note'; key: string; text: string }
  | { type: 'option'; option: PickerOption };

export interface PickerRowsInput {
  groups: FontGroup[];
  searching: boolean;
  /** Offer the "Same as body" row (heading font). */
  allowSame: boolean;
  /** Groups whose "Show all" has been used. */
  expanded: FontSource[];
}

/** The key that identifies a font's row in the picker. */
export function fontKey(font: FontFamily): string {
  return `font:${font.source}:${font.cssName}`;
}

/**
 * Lays out the picker list: an optional "Same as body" row, each group (capped, with a
 * "Show all (N)" row), a Google Fonts placeholder until that group exists, and the custom row.
 */
export function buildPickerRows(input: PickerRowsInput): PickerRow[] {
  const { groups, searching, allowSame, expanded } = input;
  const rows: PickerRow[] = [];
  if (allowSame && !searching) rows.push({ type: 'option', option: { key: 'same', kind: 'same' } });
  const cap = searching ? GROUP_CAP_SEARCHING : GROUP_CAP;
  for (const group of groups) {
    rows.push({ type: 'header', key: `header:${group.source}`, source: group.source });
    const limit = expanded.includes(group.source) ? group.fonts.length : cap;
    for (const font of group.fonts.slice(0, limit)) {
      rows.push({ type: 'option', option: { key: fontKey(font), kind: 'font', font } });
    }
    if (group.fonts.length > limit) {
      rows.push({
        type: 'option',
        option: {
          key: `more:${group.source}`,
          kind: 'more',
          source: group.source,
          total: group.fonts.length,
          next: fontKey(group.fonts[limit]),
        },
      });
    }
  }
  if (!searching && !groups.some((g) => g.source === 'google')) {
    rows.push({ type: 'header', key: 'header:google', source: 'google' });
    rows.push({ type: 'note', key: 'note:google', text: 'Coming soon' });
  }
  rows.push({ type: 'option', option: { key: 'custom', kind: 'custom' } });
  return rows;
}

const GROUP_ORDER: FontSource[] = ['builtin', 'system', 'google'];

/** Groups fonts for the picker: built-in, system, Google; A to Z inside; empty groups dropped. */
export function groupFonts(fonts: FontFamily[]): FontGroup[] {
  return GROUP_ORDER.map((source) => ({
    source,
    fonts: fonts
      .filter((f) => f.source === source)
      .sort((a, b) => a.family.localeCompare(b.family)),
  })).filter((g) => g.fonts.length > 0);
}
