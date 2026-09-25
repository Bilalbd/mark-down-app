import { useSettingsStore, type AppTheme, type SplitSide } from '@/store/settings';
import { NumberInput, Row, Section, Select, Toggle } from './controls';

export function GeneralTab() {
  const s = useSettingsStore();

  return (
    <>
      <Section title="Application">
        <Row label="Theme">
          <Select<AppTheme>
            value={s.appTheme}
            onChange={(v) => s.set('appTheme', v)}
            options={[
              { value: 'system', label: 'Follow Windows' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
        <Row label="Split layout">
          <Select<SplitSide>
            value={s.splitEditorSide}
            onChange={(v) => s.set('splitEditorSide', v)}
            options={[
              { value: 'left', label: 'Source left, formatted right' },
              { value: 'right', label: 'Formatted left, source right' },
            ]}
          />
        </Row>
        <Row label="Show outline">
          <Toggle value={s.outlineVisible} onChange={(v) => s.set('outlineVisible', v)} />
        </Row>
        <Row label="Preview zoom" hint="Ctrl + / Ctrl −">
          <NumberInput
            value={s.previewZoom}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => s.set('previewZoom', v)}
          />
        </Row>
        <Row label="Block remote images" hint="Images loaded from http(s) URLs won't load">
          <Toggle value={s.blockRemoteImages} onChange={(v) => s.set('blockRemoteImages', v)} />
        </Row>
      </Section>

      <Section title="Source editor">
        <Row label="Line numbers">
          <Toggle value={s.editorLineNumbers} onChange={(v) => s.set('editorLineNumbers', v)} />
        </Row>
        <Row label="Font size">
          <NumberInput
            value={s.editorFontSize}
            min={9}
            max={32}
            unit="px"
            onChange={(v) => s.set('editorFontSize', v)}
          />
        </Row>
      </Section>

      <Section title="Shortcuts">
        <table className="settings__shortcuts">
          <tbody>
            {[
              ['Ctrl+N', 'New file'],
              ['Ctrl+O', 'Open file'],
              ['Ctrl+S', 'Save'],
              ['Ctrl+E', 'Toggle formatted / source'],
              ['Ctrl+Shift+E', 'Toggle split view'],
              ['Ctrl+\\', 'Toggle outline'],
              ['Ctrl+F', 'Find'],
              ['Ctrl+,', 'Settings'],
              ['Ctrl+= / Ctrl+− / Ctrl+0', 'Zoom preview'],
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
    </>
  );
}
