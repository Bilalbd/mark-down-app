import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { AppearanceTab } from './AppearanceTab';
import { PresetsTab } from './PresetsTab';
import { CustomCssTab } from './CustomCssTab';
import { GeneralTab } from './GeneralTab';
import './SettingsPanel.css';

type Tab = 'appearance' | 'presets' | 'css' | 'general';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'presets', label: 'Presets' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'css', label: 'Custom CSS' },
];

export function SettingsPanel() {
  const open = useViewStore((s) => s.settingsOpen);
  const setOpen = useViewStore((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<Tab>('general');
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
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`settings__tab ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
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
      <div className="settings__body">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'presets' && <PresetsTab />}
        {tab === 'css' && <CustomCssTab />}
        {tab === 'general' && <GeneralTab />}
      </div>
    </aside>
  );
}
