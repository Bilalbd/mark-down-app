import { AppearanceTab } from './AppearanceTab';
import { CustomCssTab } from './CustomCssTab';
import { PresetsTab } from './PresetsTab';

export type AppearanceView = 'presets' | 'fonts' | 'css';

const VIEWS: { id: AppearanceView; label: string }[] = [
  { id: 'presets', label: 'Presets' },
  { id: 'fonts', label: 'Fonts & colours' },
  { id: 'css', label: 'Custom CSS' },
];

interface Props {
  view: AppearanceView;
  onViewChange: (view: AppearanceView) => void;
}

/** The three preset-related screens behind one segmented control. The chosen view lives in the
 * panel so it survives a trip to another page. */
export function AppearancePage({ view, onViewChange }: Props) {
  return (
    <>
      <div
        className="settings__segment settings__segment--fill"
        role="group"
        aria-label="Appearance"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`settings__seg ${view === v.id ? 'is-active' : ''}`}
            onClick={() => onViewChange(v.id)}
            aria-pressed={view === v.id}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === 'presets' && <PresetsTab />}
      {view === 'fonts' && <AppearanceTab />}
      {view === 'css' && <CustomCssTab />}
    </>
  );
}
