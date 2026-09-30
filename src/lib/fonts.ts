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
