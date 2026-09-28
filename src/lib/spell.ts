import type { SpellError } from '@/lib/tauri';

/**
 * The supported tag that best matches `navLang`: an exact match, else a tag sharing the same
 * primary language (preferring `en-US` among ties, e.g. `en-GB` → `en-US`), else `en-US` if it's
 * supported, else the first supported tag, else `null` if nothing is supported.
 */
function automaticLanguage(supported: string[], navLang: string): string | null {
  const navLower = navLang.toLocaleLowerCase();
  const exact = supported.find((t) => t.toLocaleLowerCase() === navLower);
  if (exact) return exact;

  const primary = navLower.split('-')[0];
  const samePrimary = supported.filter((t) => t.toLocaleLowerCase().split('-')[0] === primary);
  if (samePrimary.length > 0) {
    return samePrimary.find((t) => t.toLocaleLowerCase() === 'en-us') ?? samePrimary[0];
  }

  const enUs = supported.find((t) => t.toLocaleLowerCase() === 'en-us');
  if (enUs) return enUs;

  return supported[0] ?? null;
}

/**
 * The languages actually used to check spelling: `saved` as-is once the user has chosen it
 * explicitly, or - while it's still `[]` - the single best automatic match for `navLang` (see
 * `automaticLanguage`), which may be no language at all.
 */
export function effectiveSpellLanguages(
  saved: string[],
  supported: string[],
  navLang: string,
): string[] {
  if (saved.length > 0) return saved;
  const auto = automaticLanguage(supported, navLang);
  return auto ? [auto] : [];
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
