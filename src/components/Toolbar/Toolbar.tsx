import { FilePlus2, Monitor, Moon, PanelLeft, Settings, Sun } from 'lucide-react';
import { useSettingsStore, type AppTheme, type ViewMode } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { ExportMenu } from './ExportMenu';
import './Toolbar.css';

export const ICON = { size: 16, strokeWidth: 1.75, absoluteStrokeWidth: true } as const;

const VIEW_MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: 'formatted', label: 'Formatted', title: 'Formatted view (Ctrl+E)' },
  { id: 'source', label: 'Source', title: 'Source view (Ctrl+E)' },
  { id: 'split', label: 'Split', title: 'Split view (Ctrl+Shift+E)' },
];

const THEME_CYCLE: AppTheme[] = ['system', 'light', 'dark'];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'Follow Windows' } as const;

export function Toolbar({ onNew }: { onNew: () => void }) {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const set = useSettingsStore((s) => s.set);
  const settingsOpen = useViewStore((s) => s.settingsOpen);
  const setSettingsOpen = useViewStore((s) => s.setSettingsOpen);

  const cycleTheme = () =>
    set('appTheme', THEME_CYCLE[(THEME_CYCLE.indexOf(appTheme) + 1) % THEME_CYCLE.length]);
  const ThemeIcon = THEME_ICON[appTheme];

  return (
    <div className="toolbar">
      <button
        className={`toolbar__btn ${outlineVisible ? 'is-active' : ''}`}
        title="Toggle outline (Ctrl+\)"
        onClick={() => set('outlineVisible', !outlineVisible)}
        aria-pressed={outlineVisible}
      >
        <PanelLeft {...ICON} />
      </button>

      <div className="toolbar__segment" role="group" aria-label="View mode">
        {VIEW_MODES.map((m) => (
          <button
            key={m.id}
            className={`toolbar__seg ${viewMode === m.id ? 'is-active' : ''}`}
            title={m.title}
            onClick={() => set('viewMode', m.id)}
            aria-pressed={viewMode === m.id}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="toolbar__spacer" />

      <button className="toolbar__btn" title="New file (Ctrl+N)" onClick={onNew}>
        <FilePlus2 {...ICON} />
      </button>
      <ExportMenu />

      <button
        className="toolbar__btn"
        title={`Theme: ${THEME_LABEL[appTheme]} (click to change)`}
        onClick={cycleTheme}
      >
        <ThemeIcon {...ICON} />
      </button>

      <button
        className={`toolbar__btn ${settingsOpen ? 'is-active' : ''}`}
        title="Settings (Ctrl+,)"
        onClick={() => setSettingsOpen(!settingsOpen)}
        aria-pressed={settingsOpen}
      >
        <Settings {...ICON} />
      </button>
    </div>
  );
}
