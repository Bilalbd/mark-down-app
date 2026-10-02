import type { CatalogFont, DownloadedFont, SystemFont } from '@/lib/tauri';

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
  /** A Google font that has been downloaded, so it renders in its own face. */
  downloaded?: boolean;
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

/** Drops fonts whose family or CSS name matches one in 	aken, case-insensitively. */
export function excludeNamed(fonts: FontFamily[], taken: FontFamily[]): FontFamily[] {
  const names = new Set(taken.flatMap((f) => [f.family.toLowerCase(), f.cssName.toLowerCase()]));
  return fonts.filter(
    (f) => !names.has(f.family.toLowerCase()) && !names.has(f.cssName.toLowerCase()),
  );
}

/**
 * Drops installed fonts that are also bundled (by family or CSS name, case-insensitively), so a
 * font like JetBrains Mono appears once, under Built in.
 */
export function excludeBuiltin(
  system: FontFamily[],
  builtin: FontFamily[] = BUILTIN_FONTS,
): FontFamily[] {
  return excludeNamed(system, builtin);
}

const CATEGORIES: FontCategory[] = ['sans-serif', 'serif', 'monospace', 'display', 'handwriting'];

function toCategory(value: string): FontCategory {
  return CATEGORIES.find((c) => c === value) ?? 'sans-serif';
}

/** Turns the Google Fonts catalogue into picker entries (not downloaded, so no preview font). */
export function catalogToFamilies(catalog: CatalogFont[]): FontFamily[] {
  return catalog.map((f) => ({
    family: f.family,
    cssName: f.family,
    source: 'google',
    category: toCategory(f.category),
    monospace: f.category === 'monospace',
    arabic: f.subsets.includes('arabic'),
    googleId: f.id,
  }));
}

/** Turns the downloaded Google fonts into picker entries; Arabic if an Arabic file came with it. */
export function downloadedToFamilies(list: DownloadedFont[]): FontFamily[] {
  return list.map((f) => ({
    family: f.family,
    cssName: f.family,
    source: 'google',
    category: toCategory(f.category),
    monospace: f.category === 'monospace',
    arabic: f.files.some((file) => file.file.startsWith('arabic-')),
    googleId: f.id,
    downloaded: true,
  }));
}

/**
 * The Google group of the picker: every downloaded font, then each catalogue font that isn't
 * downloaded. A font that is built in or installed on this PC is listed there only (Built in >
 * On this PC > Google Fonts).
 */
export function googleFamilies(input: {
  catalog: FontFamily[];
  downloaded: FontFamily[];
  builtin: FontFamily[];
  system: FontFamily[];
}): FontFamily[] {
  const have = new Set(input.downloaded.map((f) => f.googleId));
  const offered = excludeNamed(
    input.catalog.filter((f) => !have.has(f.googleId)),
    [...input.builtin, ...input.system],
  );
  return [...excludeNamed(input.downloaded, input.builtin), ...offered];
}

/** Whether any of the CSS stacks starts with this family (case-insensitively). */
export function stacksUseFamily(stacks: string[], family: string): boolean {
  const name = family.toLowerCase();
  return stacks.some((s) => primaryFamily(s)?.toLowerCase() === name);
}

/** The downloaded fonts that these stacks start with, unless a built-in font has the same name. */
export function downloadedForStacks(
  stacks: string[],
  downloaded: DownloadedFont[],
): DownloadedFont[] {
  const lists: FontLists = { builtin: BUILTIN_FONTS, downloaded: downloadedToFamilies(downloaded) };
  const ids = new Set<string>();
  for (const stack of stacks) {
    const hit = resolveFamily(stack, lists);
    if (hit?.source === 'google' && hit.googleId) ids.add(hit.googleId);
  }
  return downloaded.filter((f) => ids.has(f.id));
}

/** The Google fonts, not yet downloaded, that these stacks start with and nothing else provides. */
export function missingGoogleFonts(stacks: string[], lists: FontLists): FontFamily[] {
  const found = new Map<string, FontFamily>();
  for (const stack of stacks) {
    const hit = resolveFamily(stack, lists);
    if (hit?.source === 'google' && !hit.downloaded && hit.googleId) found.set(hit.googleId, hit);
  }
  return [...found.values()];
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
  /** A status line for the Google Fonts group (loading, or no connection), shown even if empty. */
  googleNote?: string | null;
}

/** The key that identifies a font's row in the picker. */
export function fontKey(font: FontFamily): string {
  return `font:${font.source}:${font.cssName}`;
}

/**
 * Lays out the picker list: an optional "Same as body" row, each group (capped, with a
 * "Show all (N)" row), the Google Fonts status line, and the custom row.
 */
export function buildPickerRows(input: PickerRowsInput): PickerRow[] {
  const { groups, searching, allowSame, expanded, googleNote } = input;
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
    if (group.source === 'google' && googleNote) {
      rows.push({ type: 'note', key: 'note:google', text: googleNote });
    }
  }
  if (googleNote && !groups.some((g) => g.source === 'google')) {
    rows.push({ type: 'header', key: 'header:google', source: 'google' });
    rows.push({ type: 'note', key: 'note:google', text: googleNote });
  }
  rows.push({ type: 'option', option: { key: 'custom', kind: 'custom' } });
  return rows;
}

/** One collator for every sort: localeCompare builds a new one per call, which is slow on 2,000 fonts. */
const COLLATOR = new Intl.Collator();

const GROUP_ORDER: FontSource[] = ['builtin', 'system', 'google'];

/**
 * Groups fonts for the picker: built-in, system, Google; A to Z inside (downloaded Google fonts
 * first); empty groups dropped.
 */
export function groupFonts(fonts: FontFamily[]): FontGroup[] {
  return GROUP_ORDER.map((source) => ({
    source,
    fonts: fonts
      .filter((f) => f.source === source)
      .sort(
        (a, b) =>
          Number(b.downloaded ?? false) - Number(a.downloaded ?? false) ||
          COLLATOR.compare(a.family, b.family),
      ),
  })).filter((g) => g.fonts.length > 0);
}
