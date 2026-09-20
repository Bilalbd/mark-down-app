import { createHighlighterCore, type HighlighterCore, type LanguageInput } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, bundledLanguagesAlias, type BundledLanguage } from 'shiki/langs';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';

/**
 * Lazily-created Shiki highlighter. Both themes are always loaded and every code block
 * is emitted with `--shiki-light` / `--shiki-dark` CSS variables, so switching the app
 * theme never requires a re-render (preview CSS picks the variable).
 */
let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

const ALL_LANGS: Record<string, LanguageInput> = {
  ...bundledLanguages,
  ...bundledLanguagesAlias,
} as Record<string, LanguageInput>;

export function isKnownLanguage(lang: string): lang is BundledLanguage {
  return lang in ALL_LANGS;
}

/** Ensures every requested language grammar is loaded (no-op for unknown/loaded ones). */
export async function ensureLanguages(langs: Iterable<string>): Promise<void> {
  const hl = await getHighlighter();
  const loaded = new Set(hl.getLoadedLanguages());
  const missing = [...new Set(langs)].filter((l) => isKnownLanguage(l) && !loaded.has(l));
  if (missing.length === 0) return;
  await hl.loadLanguage(...missing.map((l) => ALL_LANGS[l]));
}

/** Synchronous highlight; caller must have awaited `ensureLanguages` first. */
export function highlightSync(hl: HighlighterCore, code: string, lang: string): string {
  const resolved = hl.getLoadedLanguages().includes(lang) ? lang : 'text';
  return hl.codeToHtml(code, {
    lang: resolved,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
  });
}
