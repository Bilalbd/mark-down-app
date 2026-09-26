import { describe, expect, it, beforeEach } from 'vitest';
import { useSettingsStore, isPreviewFullWidth } from '@/store/settings';

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

describe('useSettingsStore refresh', () => {
  it('is a no-op outside Tauri', async () => {
    const { refresh } = useSettingsStore.getState();
    await refresh('appTheme');
    // Should not throw and state should remain unchanged
    expect(useSettingsStore.getState().appTheme).toBe('dark');
  });
});

describe('isPreviewFullWidth', () => {
  it('is false by default (previewFullWidth: false, viewMode: formatted)', () => {
    expect(isPreviewFullWidth({ previewFullWidth: false, viewMode: 'formatted' })).toBe(false);
  });

  it('is true when previewFullWidth is on and viewMode is formatted', () => {
    expect(isPreviewFullWidth({ previewFullWidth: true, viewMode: 'formatted' })).toBe(true);
  });

  it('is false when previewFullWidth is on but viewMode is split', () => {
    expect(isPreviewFullWidth({ previewFullWidth: true, viewMode: 'split' })).toBe(false);
  });

  it('is false when previewFullWidth is on but viewMode is source', () => {
    expect(isPreviewFullWidth({ previewFullWidth: true, viewMode: 'source' })).toBe(false);
  });
});
