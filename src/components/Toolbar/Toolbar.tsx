import {
  ArrowLeftRight,
  CircleHelp,
  Code,
  Columns2,
  Eye,
  Monitor,
  Moon,
  PanelLeft,
  Settings,
  Sun,
  UnfoldHorizontal,
  type LucideIcon,
} from 'lucide-react';
import {
  useSettingsStore,
  type AppTheme,
  type ViewMode,
  isPreviewFullWidth,
} from '@/store/settings';
import { useViewStore } from '@/store/view';
import { openGuide } from '@/store/tabs';
import { ExportMenu } from './ExportMenu';
import { SaveMenu } from './SaveMenu';
import './Toolbar.css';

export const ICON = { size: 16, strokeWidth: 1.75, absoluteStrokeWidth: true } as const;

const VIEW_MODES: { id: ViewMode; label: string; icon: LucideIcon; title: string }[] = [
  { id: 'formatted', label: 'Formatted view', icon: Eye, title: 'Formatted view (Ctrl+E)' },
  { id: 'source', label: 'Source view', icon: Code, title: 'Source view (Ctrl+E)' },
  { id: 'split', label: 'Split view', icon: Columns2, title: 'Split view (Ctrl+Shift+E)' },
];

const THEME_CYCLE: AppTheme[] = ['system', 'light', 'dark'];
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'Follow Windows' } as const;

export function Toolbar() {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const splitEditorSide = useSettingsStore((s) => s.splitEditorSide);
  const previewFullWidth = useSettingsStore((s) => s.previewFullWidth);
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
        aria-label="Toggle outline"
        onClick={() => set('outlineVisible', !outlineVisible)}
        aria-pressed={outlineVisible}
      >
        <PanelLeft {...ICON} />
      </button>

      <div className="toolbar__segment" role="group" aria-label="View mode">
        {VIEW_MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              className={`toolbar__seg ${viewMode === m.id ? 'is-active' : ''}`}
              title={m.title}
              aria-label={m.label}
              onClick={() => set('viewMode', m.id)}
              aria-pressed={viewMode === m.id}
            >
              <Icon {...ICON} />
            </button>
          );
        })}
      </div>

      {viewMode === 'split' && (
        <button
          className="toolbar__btn"
          title={`Swap panes (source on the ${splitEditorSide === 'left' ? 'right' : 'left'})`}
          aria-label="Swap panes"
          onClick={() => set('splitEditorSide', splitEditorSide === 'left' ? 'right' : 'left')}
        >
          <ArrowLeftRight {...ICON} />
        </button>
      )}

      {viewMode === 'formatted' && (
        <button
          className={`toolbar__btn ${isPreviewFullWidth({ previewFullWidth, viewMode }) ? 'is-active' : ''}`}
          title={previewFullWidth ? 'Return to preset width' : 'Full width (fit the window)'}
          aria-label="Full width"
          aria-pressed={previewFullWidth}
          onClick={() => set('previewFullWidth', !previewFullWidth)}
        >
          <UnfoldHorizontal {...ICON} />
        </button>
      )}

      <div className="toolbar__spacer" />

      <SaveMenu />
      <ExportMenu />

      <button
        className="toolbar__btn"
        title={`Theme: ${THEME_LABEL[appTheme]} (click to change)`}
        aria-label={`Theme: ${THEME_LABEL[appTheme]}`}
        onClick={cycleTheme}
      >
        <ThemeIcon {...ICON} />
      </button>

      <button
        className="toolbar__btn"
        title="Guide (F1)"
        aria-label="Guide"
        onClick={() => void openGuide()}
      >
        <CircleHelp {...ICON} />
      </button>

      <button
        className={`toolbar__btn ${settingsOpen ? 'is-active' : ''}`}
        title="Settings (Ctrl+,)"
        aria-label="Settings"
        onClick={() => setSettingsOpen(!settingsOpen)}
        aria-pressed={settingsOpen}
      >
        <Settings {...ICON} />
      </button>
    </div>
  );
}
