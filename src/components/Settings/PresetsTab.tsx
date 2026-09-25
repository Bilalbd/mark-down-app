import { useState } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { isTauri, readFile, writeFile } from '@/lib/tauri';
import { useStyleStore } from '@/store/style';
import { Section } from './controls';

export function PresetsTab() {
  const presets = useStyleStore((s) => s.presets);
  const activeId = useStyleStore((s) => s.activePresetId);
  const setActive = useStyleStore((s) => s.setActive);
  const duplicate = useStyleStore((s) => s.duplicate);
  const rename = useStyleStore((s) => s.rename);
  const remove = useStyleStore((s) => s.remove);
  const importPreset = useStyleStore((s) => s.importPreset);
  const exportPreset = useStyleStore((s) => s.exportPreset);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    setDraftName(name);
  };
  const commitRename = () => {
    if (renamingId && draftName.trim()) rename(renamingId, draftName.trim());
    setRenamingId(null);
  };

  const doImport = async () => {
    if (!isTauri()) return;
    const path = await openDialog({
      multiple: false,
      filters: [{ name: 'Preset', extensions: ['json'] }],
    });
    if (typeof path !== 'string') return;
    try {
      const { content } = await readFile(path);
      const r = importPreset(content);
      setMessage(r.ok ? 'Preset imported.' : r.error);
    } catch (e) {
      setMessage(`Could not import: ${String(e)}`);
    }
  };

  const doExport = async (id: string, name: string) => {
    if (!isTauri()) return;
    const path = await saveDialog({
      defaultPath: `${name.replace(/[^\w\- ]+/g, '')}.json`,
      filters: [{ name: 'Preset', extensions: ['json'] }],
    });
    if (!path) return;
    try {
      await writeFile(path, exportPreset(id));
      setMessage('Preset exported.');
    } catch (e) {
      setMessage(`Could not export: ${String(e)}`);
    }
  };

  const doDelete = async (id: string, name: string) => {
    const choice = await useDialogStore
      .getState()
      .show('Delete preset?', `"${name}" will be permanently deleted.`, [
        { id: 'delete', label: 'Delete', danger: true },
        { id: 'cancel', label: 'Cancel', primary: true },
      ]);
    if (choice === 'delete') remove(id);
  };

  const builtins = presets.filter((p) => p.builtin);
  const custom = presets.filter((p) => !p.builtin);

  const renderList = (items: typeof presets) => (
    <ul className="presets">
      {items.map((p) => (
        <li key={p.id} className={`presets__item ${p.id === activeId ? 'is-active' : ''}`}>
          {renamingId === p.id ? (
            <input
              className="settings__text"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
            />
          ) : (
            <button
              className="presets__name"
              onClick={() => setActive(p.id)}
              title="Use this preset"
            >
              <span className="presets__radio" aria-hidden />
              {p.name}
            </button>
          )}
          <span className="presets__actions">
            <button title="Duplicate" onClick={() => setActive(duplicate(p.id))}>
              Copy
            </button>
            {!p.builtin && (
              <button title="Rename" onClick={() => startRename(p.id, p.name)}>
                Rename
              </button>
            )}
            <button title="Export as JSON" onClick={() => void doExport(p.id, p.name)}>
              Export
            </button>
            {!p.builtin && (
              <button
                title="Delete"
                className="is-danger"
                onClick={() => void doDelete(p.id, p.name)}
              >
                Delete
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <Section title="Built-in">{renderList(builtins)}</Section>
      <Section title="Custom">
        {custom.length === 0 ? (
          <p className="settings__note">
            No custom presets yet. Copy a built-in one or edit any setting in Appearance.
          </p>
        ) : (
          renderList(custom)
        )}
        <div className="settings__actions">
          <button className="settings__btn" onClick={() => void doImport()}>
            Import JSON…
          </button>
        </div>
        {message && <p className="settings__note">{message}</p>}
      </Section>
    </>
  );
}
