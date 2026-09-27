import {
  useSettingsStore,
  type AppTheme,
  type OpenFilesIn,
  type SplitSide,
} from '@/store/settings';
import { NumberInput, Row, Section, Select, Toggle } from './controls';

export function GeneralTab() {
  const openFilesIn = useSettingsStore((s) => s.openFilesIn);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const splitEditorSide = useSettingsStore((s) => s.splitEditorSide);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const previewZoom = useSettingsStore((s) => s.previewZoom);
  const blockRemoteImages = useSettingsStore((s) => s.blockRemoteImages);
  const editorLineNumbers = useSettingsStore((s) => s.editorLineNumbers);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const set = useSettingsStore((s) => s.set);

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
