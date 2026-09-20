import { useSettingsStore, type AppTheme, type ViewMode } from '@/store/settings';
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

export function Toolbar() {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const outlineVisible = useSettingsStore((s) => s.outlineVisible);
  const appTheme = useSettingsStore((s) => s.appTheme);
  const set = useSettingsStore((s) => s.set);

  const cycleTheme = () =>
    set('appTheme', THEME_CYCLE[(THEME_CYCLE.indexOf(appTheme) + 1) % THEME_CYCLE.length]);

  return (
    <div className="toolbar">
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

      <button className="toolbar__btn" title={`Theme: ${appTheme}`} onClick={cycleTheme}>
        <ThemeIcon theme={appTheme} />
      </button>

      <button className="toolbar__btn" title="Settings (Ctrl+,)" disabled>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
        </svg>
      </button>
    </div>
  );
}
