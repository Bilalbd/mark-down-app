import { useEffect, useState } from 'react';
import { useStyleStore } from '@/store/style';

const PLACEHOLDER = `/* Applies on top of the active preset. Examples: */
.preview h1 { letter-spacing: -0.02em; }
.preview blockquote { font-style: italic; }
.preview img { border-radius: 8px; }`;

export function CustomCssTab() {
  const presets = useStyleStore((s) => s.presets);
  const activeId = useStyleStore((s) => s.activePresetId);
  const updateActive = useStyleStore((s) => s.updateActive);
  const preset = presets.find((p) => p.id === activeId) ?? presets[0];

  const [draft, setDraft] = useState(preset.customCss);
  useEffect(() => setDraft(preset.customCss), [preset.id, preset.customCss]);

  // Apply live, debounced, so typing doesn't thrash the stylesheet.
  useEffect(() => {
    if (draft === preset.customCss) return;
    const t = setTimeout(() => updateActive((p) => ({ ...p, customCss: draft })), 400);
    return () => clearTimeout(t);
  }, [draft, preset.customCss, updateActive]);

  return (
    <>
      <p className="settings__note">
        CSS for <strong>{preset.name}</strong>. Target <code>.preview</code> elements; it is applied
        after the preset variables so it can override anything.
      </p>
      <textarea
        className="settings__css"
        value={draft}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: s, selectionEnd: en } = el;
            setDraft(draft.slice(0, s) + '  ' + draft.slice(en));
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
          }
        }}
      />
    </>
  );
}
