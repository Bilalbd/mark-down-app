import type { SpellError } from '@/lib/tauri';

/** The primary language subtag (everything before the first hyphen, lowercased). */
export function languageCode(tag: string): string {
  return tag.split('-')[0].toLocaleLowerCase();
}

/**
 * The preferred tag (the regional dictionary to use) for each unique language code in
 * `supported`. Rules: `en` → `en-US`, `ar` → `ar-SA`, others → the tag whose region
 * matches `new Intl.Locale(code).maximize().region`, else the first alphabetically.
 * Sorted by the language label in `uiLang`.
 */
export function spellLanguageGroups(
  supported: string[],
  uiLang: string = navigator.language,
): { code: string; tag: string }[] {
  const groups = new Map<string, string[]>();
  for (const tag of supported) {
    const code = languageCode(tag);
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code)!.push(tag);
  }

  const result: { code: string; tag: string }[] = [];
  for (const [code, tags] of groups) {
    let preferred: string;
    if (code === 'en') {
      // Bilal's choice: en-US
      preferred = tags.find((t) => t.toLocaleLowerCase() === 'en-us') ?? tags[0];
    } else if (code === 'ar') {
      // Bilal's choice: ar-SA
      preferred = tags.find((t) => t.toLocaleLowerCase() === 'ar-sa') ?? tags[0];
    } else {
      // Use the tag whose region matches the language's likely region
      const likelyRegion = new Intl.Locale(code).maximize().region;
      preferred =
        (likelyRegion &&
          tags.find((t) =>
            t.toLocaleLowerCase().endsWith(`-${likelyRegion.toLocaleLowerCase()}`),
          )) ||
        [...tags].sort()[0];
    }
    result.push({ code, tag: preferred });
  }

  // Sort by language label
  result.sort((a, b) => {
    const aLabel = languageLabel(a.code, uiLang);
    const bLabel = languageLabel(b.code, uiLang);
    return aLabel.localeCompare(bLabel);
  });

  return result;
}

/**
 * The languages actually used to check spelling: converts saved language codes to their
 * preferred tags. `saved` may contain old regional tags (from before this change), which are
 * normalised to language codes. If `saved` is empty, returns the automatic pick based on
 * `navLang`'s primary subtag and the available dictionaries.
 */
export function effectiveSpellLanguages(
  saved: string[],
  supported: string[],
  navLang: string,
): string[] {
  // Normalise old regional tags to language codes and deduplicate (preserving first occurrence order)
  const seenCodes = new Set<string>();
  const codes: string[] = [];
  for (const v of saved) {
    const code = languageCode(v);
    if (!seenCodes.has(code)) {
      seenCodes.add(code);
      codes.push(code);
    }
  }

  // If there's an explicit choice, convert it to preferred tags (preserving order)
  if (codes.length > 0) {
    const groups = new Map<string, string>();
    for (const group of spellLanguageGroups(supported)) {
      groups.set(group.code, group.tag);
    }
    return codes.map((code) => groups.get(code)).filter((tag) => tag !== undefined) as string[];
  }

  // Automatic: find the primary subtag of navLang
  const navCode = languageCode(navLang);
  const groups = spellLanguageGroups(supported);
  const autoGroup = groups.find((g) => g.code === navCode);
  if (autoGroup) return [autoGroup.tag];

  // Fall back to en if available, else the first language, else none
  const enGroup = groups.find((g) => g.code === 'en');
  if (enGroup) return [enGroup.tag];

  return groups.length > 0 ? [groups[0].tag] : [];
}

/** A language tag's display name in `uiLang` (e.g. "English (United States)"), or the tag
 * itself if the platform can't name it. */
export function languageLabel(tag: string, uiLang: string): string {
  try {
    return new Intl.DisplayNames([uiLang], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Whether `word` is in the personal dictionary or the session's ignore list (case-insensitive). */
export function isKnownWord(
  word: string,
  spellWords: readonly string[],
  ignored: ReadonlySet<string>,
): boolean {
  const lower = word.toLocaleLowerCase();
  if (ignored.has(lower)) return true;
  return spellWords.some((w) => w.toLocaleLowerCase() === lower);
}

/** At most this many (languages, text) results are kept before the cache is cleared outright -
 * simplest way to cap memory use for a long editing session without tracking recency. */
const MAX_CACHE_ENTRIES = 5000;

/**
 * Caches `spell_check` results per (languages, exact segment text), so re-checking a window that
 * overlaps a previous one (scrolling back, or an edit elsewhere on the line) doesn't re-ask Rust
 * for text it already has an answer for. Cleared outright once it would exceed its cap, and
 * whenever the checked languages change (callers create a fresh cache for that).
 */
export class SpellCache {
  private readonly entries = new Map<string, SpellError[]>();

  private key(languages: readonly string[], text: string): string {
    return `${[...languages].sort().join(',')}\u0000${text}`;
  }

  get(languages: readonly string[], text: string): SpellError[] | undefined {
    return this.entries.get(this.key(languages, text));
  }

  set(languages: readonly string[], text: string, errors: SpellError[]): void {
    if (this.entries.size >= MAX_CACHE_ENTRIES) this.entries.clear();
    this.entries.set(this.key(languages, text), errors);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
