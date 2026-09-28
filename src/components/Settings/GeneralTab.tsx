import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  useSettingsStore,
  type AppTheme,
  type OpenFilesIn,
  type SplitSide,
} from '@/store/settings';
import { useViewStore } from '@/store/view';
import { getAppVersion, spellLanguages as fetchSpellLanguages } from '@/lib/tauri';
import {
  effectiveSpellLanguages,
  languageLabel,
  spellLanguageGroups,
  languageCode,
} from '@/lib/spell';
import { ICON } from '@/components/Toolbar/Toolbar';
import { NumberInput, Row, Section, Select, Toggle } from './controls';

export function GeneralTab() {
  const [version, setVersion] = useState<string | null>(null);
  const openFilesIn = useSettingsStore((s) => s.openFilesIn);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const splitEditorSide = useSettingsStore((s) => s.splitEditorSide);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const statusBarVisible = useSettingsStore((s) => s.statusBarVisible);
  const previewZoom = useSettingsStore((s) => s.previewZoom);
  const blockRemoteImages = useSettingsStore((s) => s.blockRemoteImages);
  const editorLineNumbers = useSettingsStore((s) => s.editorLineNumbers);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const selfContainedExport = useSettingsStore((s) => s.selfContainedExport);
  const spellCheck = useSettingsStore((s) => s.spellCheck);
  const spellLanguagesSetting = useSettingsStore((s) => s.spellLanguages);
  const spellWords = useSettingsStore((s) => s.spellWords);
  const set = useSettingsStore((s) => s.set);

  const supportedLanguages = useViewStore((s) => s.spellSupportedLanguages);
  const setSpellSupportedLanguages = useViewStore((s) => s.setSpellSupportedLanguages);

  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

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
  // sorted by label - computed once and frozen for as long as this tab stays mounted. Reopening
  // Settings remounts GeneralTab and re-freezes the order.
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
      <Section title="Application">
        <Row
          label="Open files in"
          hint={
            openFilesIn === 'window'
              ? 'Every file opens in its own window, unless this one is empty'
              : 'All files open as tabs in this window'
          }
        >
          <Select<OpenFilesIn>
            value={openFilesIn}
            onChange={(v) => set('openFilesIn', v)}
            options={[
              { value: 'tab', label: 'New tab' },
              { value: 'window', label: 'New window' },
            ]}
          />
        </Row>
        <Row label="Theme">
          <Select<AppTheme>
            value={appTheme}
            onChange={(v) => set('appTheme', v)}
            options={[
              { value: 'system', label: 'Follow Windows' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
        <Row label="Split layout">
          <Select<SplitSide>
            value={splitEditorSide}
            onChange={(v) => set('splitEditorSide', v)}
            options={[
              { value: 'left', label: 'Source left, formatted right' },
              { value: 'right', label: 'Formatted left, source right' },
            ]}
          />
        </Row>
        <Row label="Show outline">
          <Toggle value={outlineVisible} onChange={(v) => set('outlineVisible', v)} />
        </Row>
        <Row label="Show status bar">
          <Toggle value={statusBarVisible} onChange={(v) => set('statusBarVisible', v)} />
        </Row>
        <Row label="Preview zoom" hint="Ctrl + / Ctrl −">
          <NumberInput
            value={previewZoom}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => set('previewZoom', v)}
          />
        </Row>
        <Row label="Block remote images" hint="Images loaded from http(s) URLs won't load">
          <Toggle value={blockRemoteImages} onChange={(v) => set('blockRemoteImages', v)} />
        </Row>
      </Section>

      <Section title="Source editor">
        <Row label="Line numbers">
          <Toggle value={editorLineNumbers} onChange={(v) => set('editorLineNumbers', v)} />
        </Row>
        <Row label="Font size">
          <NumberInput
            value={editorFontSize}
            min={9}
            max={32}
            unit="px"
            onChange={(v) => set('editorFontSize', v)}
          />
        </Row>
      </Section>

      <Section title="Spelling">
        <Row label="Check spelling">
          <Toggle value={spellCheck} onChange={(v) => set('spellCheck', v)} />
        </Row>
        <Row label="Languages" asLabel={false}>
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
        <Row label="Personal dictionary" asLabel={false}>
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

      <Section title="Export">
        <Row label="Self-contained HTML export" hint="Embeds images and maths fonts; larger files">
          <Toggle value={selfContainedExport} onChange={(v) => set('selfContainedExport', v)} />
        </Row>
      </Section>

      <Section title="Shortcuts">
        <table className="settings__shortcuts">
          <tbody>
            {[
              ['Ctrl+N', 'New file'],
              ['Ctrl+O', 'Open file'],
              ['Ctrl+S', 'Save'],
              ['Ctrl+Shift+S', 'Save as'],
              ['Ctrl+T', 'New tab'],
              ['Ctrl+W', 'Close tab'],
              ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'],
              ['Ctrl+PageDown / Ctrl+PageUp', 'Next / previous tab'],
              ['Ctrl+1 … Ctrl+9', 'Go to tab'],
              ['Ctrl+Shift+← / Ctrl+Shift+→', 'Move tab left / right'],
              ['Ctrl+E', 'Toggle formatted / source'],
              ['Ctrl+Shift+E', 'Toggle split view'],
              ['Ctrl+\\', 'Toggle outline'],
              ['Ctrl+F', 'Find'],
              ['Ctrl+,', 'Settings'],
              ['Ctrl+= / Ctrl+− / Ctrl+0 / Ctrl+wheel', 'Zoom preview'],
            ].map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="settings__shortcuts">
          <tbody>
            <tr>
              <td colSpan={2}>
                <strong>Editing (Source view)</strong>
              </td>
            </tr>
            {[
              ['Ctrl+B', 'Bold'],
              ['Ctrl+I', 'Italic'],
              ['Ctrl+K', 'Link'],
              ['Ctrl+Shift+1 … Ctrl+Shift+6', 'Heading 1–6 (press again for a paragraph)'],
            ].map(([k, d]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {version && <p className="settings__version">Version {version}</p>}
    </>
  );
}
