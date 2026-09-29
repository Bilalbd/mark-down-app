import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { AboutPage } from './AboutPage';
import { AppearancePage, type AppearanceView } from './AppearancePage';
import { EditorPage } from './EditorPage';
import { GeneralPage } from './GeneralPage';
import { ShortcutsPage } from './ShortcutsPage';
import './SettingsPanel.css';

type Page = 'general' | 'editor' | 'appearance' | 'shortcuts' | 'about';

const PAGES: { id: Page; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'editor', label: 'Editor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
];

export function SettingsPanel() {
  const open = useViewStore((s) => s.settingsOpen);
  const setOpen = useViewStore((s) => s.setSettingsOpen);
  // The panel stays mounted while closed, so the last page (and the Appearance view) are
  // remembered until the app closes; they are never saved.
  const [page, setPage] = useState<Page>('general');
  const [appearanceView, setAppearanceView] = useState<AppearanceView>('presets');
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (useDialogStore.getState().current !== null) return;
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, setOpen]);

  if (!open || !loaded) return null;

  return (
    <aside className="settings" aria-label="Settings">
      <header className="settings__header">
        <nav className="settings__tabs" role="tablist">
          {PAGES.map((p) => (
            <button
              key={p.id}
              id={`settings-tab-${p.id}`}
              role="tab"
              aria-selected={page === p.id}
              aria-controls="settings-page"
              className={`settings__tab ${page === p.id ? 'is-active' : ''}`}
              onClick={() => setPage(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <button
          className="settings__close"
          onClick={() => setOpen(false)}
          aria-label="Close settings"
        >
          <X size={14} strokeWidth={1.75} absoluteStrokeWidth />
        </button>
      </header>
      {/* Keyed by page so each page opens scrolled to the top. */}
      <div
        key={page}
        id="settings-page"
        role="tabpanel"
        aria-labelledby={`settings-tab-${page}`}
        className="settings__body"
      >
        {page === 'general' && <GeneralPage />}
        {page === 'editor' && <EditorPage />}
        {page === 'appearance' && (
          <AppearancePage view={appearanceView} onViewChange={setAppearanceView} />
        )}
        {page === 'shortcuts' && <ShortcutsPage />}
        {page === 'about' && <AboutPage />}
      </div>
    </aside>
  );
}
