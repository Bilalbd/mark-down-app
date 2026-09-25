import { describe, expect, it, beforeEach } from 'vitest';
import { useSettingsStore } from '@/store/settings';

// No Tauri in this environment, so the store falls back to memory-only persistence.
describe('useSettingsStore recent files', () => {
  beforeEach(() => {
    useSettingsStore.setState({ recentFiles: [] });
  });

  it('adds a file to the front, deduped', () => {
    const { addRecentFile } = useSettingsStore.getState();
    addRecentFile('a.md');
    addRecentFile('b.md');
    addRecentFile('a.md');
    expect(useSettingsStore.getState().recentFiles).toEqual(['a.md', 'b.md']);
  });

  it('caps the list at 5 entries', () => {
    const { addRecentFile } = useSettingsStore.getState();
    for (const f of ['a', 'b', 'c', 'd', 'e', 'f']) addRecentFile(`${f}.md`);
    expect(useSettingsStore.getState().recentFiles).toEqual([
      'f.md',
      'e.md',
      'd.md',
      'c.md',
      'b.md',
    ]);
  });

  it('removes a file from the list', () => {
    const { addRecentFile, removeRecentFile } = useSettingsStore.getState();
    addRecentFile('a.md');
    addRecentFile('b.md');
    removeRecentFile('a.md');
    expect(useSettingsStore.getState().recentFiles).toEqual(['b.md']);
  });

  it('is a no-op removing a path that is not in the list', () => {
    const { addRecentFile, removeRecentFile } = useSettingsStore.getState();
    addRecentFile('a.md');
    removeRecentFile('missing.md');
    expect(useSettingsStore.getState().recentFiles).toEqual(['a.md']);
  });
});
