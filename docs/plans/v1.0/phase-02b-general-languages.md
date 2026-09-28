# Phase 2b: One entry per language in the Spelling settings

A follow-up to Phase 2, asked for by Bilal on 2026-09-28. Settings → General → Spelling currently
lists every regional dictionary Windows has (20 on this PC: 16 kinds of Arabic, 4 kinds of English).
Show **one entry per language** instead ("English", "Arabic"), and pick the regional dictionary
behind the scenes.

## Rules (Bilal's decision, plus a supervisor rule for other languages)

1. **The list shows languages, not regions.** Group the tags from `spellLanguages()` by their
   primary language subtag (`en-US`, `en-CA` → `en`; `ar-SA`, `ar-EG` → `ar`). One checkbox per
   group, labelled with the language name only: `languageLabel('en', uiLang)` → "English",
   `'ar'` → "Arabic". Sorted as today: ticked first (frozen while Settings is open), then by label.
2. **Which dictionary each language uses** (the "preferred tag"), among the tags Windows actually
   has for that language:
   - `en` → `en-US` (Bilal).
   - `ar` → `ar-SA` (Bilal).
   - Any other language → the tag whose region is the language's likely region from
     `new Intl.Locale(code).maximize().region` (e.g. `fr` → `FR`, `de` → `DE`), if installed.
   - Otherwise the first installed tag for that language, alphabetically.
   So if a PC only has `en-GB`, "English" uses `en-GB`.
3. **What's saved:** `spellLanguages` now holds **language codes** (`["en", "ar"]`), not regional
   tags. `[]` still means automatic. Saved values from before this change (regional tags such as
   `"ar-SA"`) are read as their language code (`"ar"`), with duplicates removed, so nobody's
   choice is lost. Don't write a migration to disk; just normalise when reading.
4. **Automatic** (`[]`): the language of `navigator.language` (its primary subtag) if Windows has
   any dictionary for it, else `en` if available, else the first language, else none.
5. **Checking:** the editor sends the **preferred tags** of the ticked languages to `spellCheck`
   (e.g. `["en-US", "ar-SA"]`). Nothing changes in Rust.
6. The "only ticked language can't be unticked" rule, the note under the list and the personal
   dictionary stay as they are.

## Files

- `src/lib/spell.ts` + `src/lib/spell.test.ts`: the pure logic. Suggested shape (adjust names if
  something fits the file better, and explain in the Report):
  - `languageCode(tag: string): string`: the lower-cased primary subtag.
  - `spellLanguageGroups(supported: string[]): { code: string; tag: string }[]`: one entry per
    language with its preferred tag (rules 1–2).
  - `effectiveSpellLanguages(saved: string[], supported: string[], navLang: string): string[]`:
    now returns the **preferred tags** to check, from saved language codes (rules 3–4).
    Accepts old regional tags in `saved` (rule 3).
- `src/components/Settings/GeneralTab.tsx` + `GeneralTab.test.tsx`: list the groups; ticking
  writes language codes.
- `src/components/Editor/SourceEditor.tsx`: only if its call needs to change.
- `src/store/settings.ts`: update the `spellLanguages` doc comment only.
- `README.md`: if it mentions regional languages, adjust the wording.

## Tests

Existing tests whose expectations change because of this deliberate behaviour change (e.g. the
ones that list regional labels such as "English (United States)") may be **updated** in this
commit. Say which ones and why in the commit message and the Report. Don't delete or weaken any
other test.

New tests in `spell.test.ts`, at least:
- groups: `['ar-EG','ar-SA','en-CA','en-US']` → `[{code:'ar',tag:'ar-SA'},{code:'en',tag:'en-US'}]`;
- `en` without `en-US` installed: `['en-CA','en-GB']` → `en-CA` (the likely region `US` isn't
  installed, so it's the first alphabetically);
- a third language: `['fr-CA','fr-FR']` → `fr-FR`;
- `effectiveSpellLanguages(['en','ar'], supported, 'en-US')` → `['en-US','ar-SA']`;
- old saved tags: `(['ar-EG','en-US'], …)` → `['ar-SA','en-US']` (normalised, preferred tags);
- duplicates: `(['en-US','en-CA'], …)` → one `en-US`;
- automatic: `navLang 'en-GB'` with `en-US` installed → `['en-US']`; `navLang 'fr-FR'` with no
  French → `['en-US']`; nothing supported → `[]`;
- a saved code that's no longer installed is skipped.

New tests in `GeneralTab.test.tsx`: with `['ar-EG','ar-SA','en-CA','en-US']` supported, exactly
two checkboxes labelled with the language names; ticking Arabic writes `['en','ar']` (or the
right order), never a regional tag.

## Verify

- [ ] `pnpm test` (write the count before and after), `pnpm lint`, `npx tsc --noEmit`,
  `pnpm format`.
- [ ] Dev app, launched exactly as the README's rules say. Settings → General → Spelling in
  **light and dark**: exactly two checkboxes, "Arabic" and "English". Open each screenshot and
  describe it. Check the two files differ (`Get-FileHash`); identical files are not a light/dark
  check.
- [ ] With a copy of `fixtures/spelling.md` in Source view: English only → the Arabic words are
  underlined; English + Arabic → only the misspelled Arabic word is. Set these with
  `window.__mdv.settings.getState().set('spellLanguages', ['en', 'ar'], { persist: false })`.
  Quote the list of underlined words (`.cm-misspelled` text) for each.
- [ ] Commit: `Show one spelling entry per language`, ending with a blank line and
  `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`. Tick these boxes and fill in the
  Report in the same commit.

## Report

_(agent fills in)_

## Supervisor check

_(supervisor fills in)_
