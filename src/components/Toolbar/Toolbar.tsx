import { useSettingsStore, type AppTheme, type ViewMode } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { ExportMenu } from './ExportMenu';
import './Toolbar.css';

const VIEW_MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: 'formatted', label: 'Formatted', title: 'Formatted view (Ctrl+E)' },
  { id: 'source', label: 'Source', title: 'Source view (Ctrl+E)' },
  { id: 'split', label: 'Split', title: 'Split view (Ctrl+Shift+E)' },
];

const THEME_CYCLE: AppTheme[] = ['system', 'light', 'dark'];

function ThemeIcon({ theme }: { theme: AppTheme }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
  };
  if (theme === 'light') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" />
      </svg>
    );
  }
  if (theme === 'dark') {
    return (
      <svg {...common}>
        <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1" />
      <path d="M5 14h6" />
    </svg>
  );
}

export function Toolbar({ onNew }: { onNew: () => void }) {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const set = useSettingsStore((s) => s.set);
  const settingsOpen = useViewStore((s) => s.settingsOpen);
  const setSettingsOpen = useViewStore((s) => s.setSettingsOpen);

  const cycleTheme = () =>
    set('appTheme', THEME_CYCLE[(THEME_CYCLE.indexOf(appTheme) + 1) % THEME_CYCLE.length]);

  return (
    <div className="toolbar">
      <button className="toolbar__btn" title="New file (Ctrl+N)" onClick={onNew}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M9 1.5H3.5v13h9V5.5z" />
          <path d="M9 1.5v4h3.5M6 9.5h4M8 7.5v4" />
        </svg>
      </button>
      <button
        className={`toolbar__btn ${outlineVisible ? 'is-active' : ''}`}
        title="Toggle outline (Ctrl+\)"
        onClick={() => set('outlineVisible', !outlineVisible)}
        aria-pressed={outlineVisible}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 4h12M2 8h8M2 12h10" />
        </svg>
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

      <ExportMenu />

      <button className="toolbar__btn" title={`Theme: ${appTheme}`} onClick={cycleTheme}>
        <ThemeIcon theme={appTheme} />
      </button>

      <button
        className={`toolbar__btn ${settingsOpen ? 'is-active' : ''}`}
        title="Settings (Ctrl+,)"
        onClick={() => setSettingsOpen(!settingsOpen)}
        aria-pressed={settingsOpen}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="2.2" />
          <path
            strokeLinejoin="round"
            d="M6.9 1.5h2.2l.35 1.7a5 5 0 0 1 1.3.75l1.65-.55 1.1 1.9-1.3 1.15a5 5 0 0 1 0 1.5l1.3 1.15-1.1 1.9-1.65-.55a5 5 0 0 1-1.3.75l-.35 1.7H6.9l-.35-1.7a5 5 0 0 1-1.3-.75l-1.65.55-1.1-1.9 1.3-1.15a5 5 0 0 1 0-1.5L2.5 5.3l1.1-1.9 1.65.55a5 5 0 0 1 1.3-.75z"
          />
        </svg>
      </button>
    </div>
  );
}
