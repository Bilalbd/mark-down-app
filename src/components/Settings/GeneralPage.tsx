import {
  useSettingsStore,
  type AppTheme,
  type OpenFilesIn,
  type SplitSide,
} from '@/store/settings';
import { NumberInput, Row, Section, Select, Toggle } from './controls';

export function GeneralPage() {
  const openFilesIn = useSettingsStore((s) => s.openFilesIn);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const splitEditorSide = useSettingsStore((s) => s.splitEditorSide);
  const splitCursorMirror = useSettingsStore((s) => s.splitCursorMirror);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const statusBarVisible = useSettingsStore((s) => s.statusBarVisible);
  const previewZoom = useSettingsStore((s) => s.previewZoom);
  const blockRemoteImages = useSettingsStore((s) => s.blockRemoteImages);
  const selfContainedExport = useSettingsStore((s) => s.selfContainedExport);
  const set = useSettingsStore((s) => s.set);

  return (
    <>
      <Section title="Window">
        <Row label="Theme" hint="The look of the app itself, not the document">
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
      </Section>

      <Section title="Layout">
        <Row label="Show outline" hint={'The headings sidebar (Ctrl+\\)'}>
          <Toggle value={outlineVisible} onChange={(v) => set('outlineVisible', v)} />
        </Row>
        <Row label="Show status bar" hint="Counts, zoom, encoding and line endings">
          <Toggle value={statusBarVisible} onChange={(v) => set('statusBarVisible', v)} />
        </Row>
        <Row label="Split layout" hint="Which side the source editor sits on">
          <Select<SplitSide>
            value={splitEditorSide}
            onChange={(v) => set('splitEditorSide', v)}
            options={[
              { value: 'left', label: 'Source left, formatted right' },
              { value: 'right', label: 'Formatted left, source right' },
            ]}
          />
        </Row>
        <Row
          label="Highlight the cursor's block in Split view"
          hint="Tints the formatted block you're editing"
        >
          <Toggle value={splitCursorMirror} onChange={(v) => set('splitCursorMirror', v)} />
        </Row>
        <Row label="Preview zoom" hint="Also Ctrl + and Ctrl −">
          <NumberInput
            value={previewZoom}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => set('previewZoom', v)}
          />
        </Row>
      </Section>

      <Section title="Documents">
        <Row label="Block remote images" hint="Images loaded from http(s) URLs won't load">
          <Toggle value={blockRemoteImages} onChange={(v) => set('blockRemoteImages', v)} />
        </Row>
        <Row label="Self-contained HTML export" hint="Embeds images and maths fonts; larger files">
          <Toggle value={selfContainedExport} onChange={(v) => set('selfContainedExport', v)} />
        </Row>
      </Section>
    </>
  );
}
