import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { spellLanguages as fetchSpellLanguages } from '@/lib/tauri';
import {
  effectiveSpellLanguages,
  languageLabel,
  spellLanguageGroups,
  languageCode,
} from '@/lib/spell';
import { ICON } from '@/components/Toolbar/Toolbar';
import { NumberInput, Row, Section, Toggle } from './controls';

export function EditorPage() {
  const editorLineNumbers = useSettingsStore((s) => s.editorLineNumbers);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const spellCheck = useSettingsStore((s) => s.spellCheck);
  const spellLanguagesSetting = useSettingsStore((s) => s.spellLanguages);
  const spellWords = useSettingsStore((s) => s.spellWords);
  const set = useSettingsStore((s) => s.set);

  const supportedLanguages = useViewStore((s) => s.spellSupportedLanguages);
  const setSpellSupportedLanguages = useViewStore((s) => s.setSpellSupportedLanguages);

  useEffect(() => {
    void fetchSpellLanguages()
      .then(setSpellSupportedLanguages)
      .catch(() => undefined); // spell check is a hint - failure just leaves the checklist empty
  }, [setSpellSupportedLanguages]);

  const uiLang = navigator.language;

  // Get the language groups from the supported tags
  const languageGroups = useMemo(
    () => (supportedLanguages.length > 0 ? spellLanguageGroups(supportedLanguages, uiLang) : []),
    [supportedLanguages, uiLang],
  );

  const tickedLanguageCodes = useMemo(
    () =>
      new Set(
        spellLanguagesSetting.length > 0
          ? spellLanguagesSetting.map((v) => languageCode(v))
          : effectiveSpellLanguages([], supportedLanguages, uiLang).map((tag) => languageCode(tag)),
      ),
    [spellLanguagesSetting, supportedLanguages, uiLang],
  );

  // Ticked languages first (so the ones in use are visible without scrolling a long list), then
  // sorted by label - computed once and frozen for as long as this page stays mounted. Leaving
  // the Editor page (or closing Settings) and coming back remounts it and re-freezes the order.
  const orderRef = useRef<typeof languageGroups | null>(null);
  if (orderRef.current === null && languageGroups.length > 0) {
    orderRef.current = [...languageGroups].sort((a, b) => {
      const tickedDiff =
        Number(tickedLanguageCodes.has(b.code)) - Number(tickedLanguageCodes.has(a.code));
      if (tickedDiff !== 0) return tickedDiff;
      return languageLabel(a.code, uiLang).localeCompare(languageLabel(b.code, uiLang));
    });
  }
  const languageRows = (orderRef.current ?? languageGroups).map(({ code }) => ({
    code,
    label: languageLabel(code, uiLang),
  }));

  const toggleLanguage = (code: string) => {
    // Normalise saved setting to language codes, deduplicating old regional tags
    const seenCodes = new Set<string>();
    const normalizedCurrent: string[] = [];
    for (const v of spellLanguagesSetting.length > 0
      ? spellLanguagesSetting
      : [...tickedLanguageCodes]) {
      const normalized = languageCode(v);
      if (!seenCodes.has(normalized)) {
        seenCodes.add(normalized);
        normalizedCurrent.push(normalized);
      }
    }
    // The checkbox for the sole ticked language is disabled in the UI (so `[]` always means
    // "automatic", never "explicitly nothing" - see the phase 2 review), but guard here too in
    // case this is ever called some other way.
    if (normalizedCurrent.includes(code) && normalizedCurrent.length === 1) return;
    const next = normalizedCurrent.includes(code)
      ? normalizedCurrent.filter((c) => c !== code)
      : [...normalizedCurrent, code];
    set('spellLanguages', next);
  };

  const removeWord = (word: string) => {
    set(
      'spellWords',
      spellWords.filter((w) => w !== word),
    );
  };

  return (
    <>
      <Section title="Editor">
        <Row label="Font size" hint="Text size in the source editor">
          <NumberInput
            value={editorFontSize}
            min={9}
            max={32}
            unit="px"
            onChange={(v) => set('editorFontSize', v)}
          />
        </Row>
        <Row label="Line numbers" hint="Show a number beside each line">
          <Toggle value={editorLineNumbers} onChange={(v) => set('editorLineNumbers', v)} />
        </Row>
      </Section>

      <Section title="Spelling">
        <Row label="Check spelling" hint="Underline misspelled words while you type">
          <Toggle value={spellCheck} onChange={(v) => set('spellCheck', v)} />
        </Row>
        <Row label="Languages" hint="Checked together" asLabel={false}>
          {supportedLanguages.length === 0 ? (
            <p className="settings__note">
              Windows has no spelling dictionaries installed. Add a language in Windows Settings →
              Time &amp; language → Language &amp; region.
            </p>
          ) : (
            <div className="settings__stack">
              <ul className="settings__checklist">
                {languageRows.map(({ code, label }) => {
                  const isOnlyTicked =
                    tickedLanguageCodes.size === 1 && tickedLanguageCodes.has(code);
                  return (
                    <li key={code} data-tag={code}>
                      <label>
                        <input
                          type="checkbox"
                          checked={tickedLanguageCodes.has(code)}
                          disabled={!spellCheck || isOnlyTicked}
                          onChange={() => toggleLanguage(code)}
                        />
                        {label}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="settings__note">To stop checking, turn off Check spelling.</p>
            </div>
          )}
        </Row>
        <Row label="Personal dictionary" hint="Words you added" asLabel={false}>
          {spellWords.length === 0 ? (
            <p className="settings__note">No words added yet.</p>
          ) : (
            <ul className="settings__word-list">
              {spellWords.map((word) => (
                <li key={word}>
                  <span>{word}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${word}`}
                    onClick={() => removeWord(word)}
                  >
                    <X {...ICON} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Row>
      </Section>
    </>
  );
}
