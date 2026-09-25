import { useCallback, useState } from 'react';
import { useResolvedTheme } from '@/lib/useAppTheme';
import {
  COLOR_LABELS,
  useStyleStore,
  type ColorSet,
  type StylePreset,
  type Typography,
} from '@/store/style';
import { ColorInput, FontInput, NumberInput, Row, Section } from './controls';

export function AppearanceTab() {
  const presets = useStyleStore((s) => s.presets);
  const activeId = useStyleStore((s) => s.activePresetId);
  const updateActive = useStyleStore((s) => s.updateActive);
  const preset = presets.find((p) => p.id === activeId) ?? presets[0];
  const resolved = useResolvedTheme();
  const [editTheme, setEditTheme] = useState<'light' | 'dark'>(resolved);

  const setTypo = useCallback(
    <K extends keyof Typography>(key: K, value: Typography[K]) =>
      updateActive((p) => ({ ...p, typography: { ...p.typography, [key]: value } })),
    [updateActive],
  );
  const setColor = (key: keyof ColorSet, value: string) =>
    updateActive((p) => ({
      ...p,
      colors: { ...p.colors, [editTheme]: { ...p.colors[editTheme], [key]: value } },
    }));
  const setScale = (i: number, value: number) =>
    updateActive((p) => {
      const headingScale = [...p.headingScale] as StylePreset['headingScale'];
      headingScale[i] = value;
      return { ...p, headingScale };
    });

  const t = preset.typography;

  return (
    <>
      <p className="settings__note">
        Editing <strong>{preset.name}</strong>
        {preset.builtin && ' — changes will be saved as a new custom preset.'}
      </p>

      <Section title="Typography">
        <Row label="Body font">
          <FontInput value={t.bodyFont} onChange={(v) => setTypo('bodyFont', v)} />
        </Row>
        <Row label="Heading font" hint="blank = same as body">
          <FontInput
            value={t.headingFont}
            onChange={(v) => setTypo('headingFont', v)}
            placeholder="Same as body"
          />
        </Row>
        <Row label="Code font">
          <FontInput value={t.monoFont} onChange={(v) => setTypo('monoFont', v)} />
        </Row>
        <Row label="Base size">
          <NumberInput
            value={t.baseSize}
            min={10}
            max={32}
            unit="px"
            onChange={(v) => setTypo('baseSize', v)}
          />
        </Row>
        <Row label="Line height">
          <NumberInput
            value={t.lineHeight}
            min={1}
            max={2.5}
            step={0.05}
            onChange={(v) => setTypo('lineHeight', v)}
          />
        </Row>
        <Row label="Content width">
          <NumberInput
            value={t.contentWidth}
            min={400}
            max={2000}
            step={10}
            unit="px"
            onChange={(v) => setTypo('contentWidth', v)}
          />
        </Row>
        <Row label="Block spacing">
          <NumberInput
            value={t.paragraphSpacing}
            min={0}
            max={3}
            step={0.1}
            unit="em"
            onChange={(v) => setTypo('paragraphSpacing', v)}
          />
        </Row>
        <Row label="Heading weight">
          <NumberInput
            value={t.headingWeight}
            min={300}
            max={900}
            step={100}
            onChange={(v) => setTypo('headingWeight', v)}
          />
        </Row>
      </Section>

      <Section title="Heading sizes (× base)">
        <div className="settings__grid">
          {preset.headingScale.map((v, i) => (
            <Row key={i} label={`H${i + 1}`}>
              <NumberInput
                value={v}
                min={0.5}
                max={4}
                step={0.05}
                onChange={(n) => setScale(i, n)}
              />
            </Row>
          ))}
        </div>
      </Section>

      <Section title="Colours">
        <div className="settings__segment" role="group" aria-label="Edit colours for">
          {(['light', 'dark'] as const).map((th) => (
            <button
              key={th}
              className={`settings__seg ${editTheme === th ? 'is-active' : ''}`}
              onClick={() => setEditTheme(th)}
              aria-pressed={editTheme === th}
            >
              {th === 'light' ? 'Light' : 'Dark'}
              {th === resolved && ' (active)'}
            </button>
          ))}
        </div>
        {(Object.keys(COLOR_LABELS) as (keyof ColorSet)[]).map((key) => (
          <Row key={key} label={COLOR_LABELS[key]} asLabel={false}>
            <ColorInput value={preset.colors[editTheme][key]} onChange={(v) => setColor(key, v)} />
          </Row>
        ))}
      </Section>
    </>
  );
}
