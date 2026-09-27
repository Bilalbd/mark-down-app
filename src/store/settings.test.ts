import { describe, expect, it, beforeEach } from 'vitest';
import {
  useSettingsStore,
  isPreviewFullWidth,
  zoomPreviewBy,
  resetPreviewZoom,
} from '@/store/settings';

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

describe('zoomPreviewBy', () => {
  beforeEach(() => {
    useSettingsStore.setState({ previewZoom: 1 });
  });

  it('steps up by 0.1', () => {
    expect(zoomPreviewBy(0.1)).toBe(1.1);
  });

  it('steps down by 0.1', () => {
    useSettingsStore.setState({ previewZoom: 1.5 });
    expect(zoomPreviewBy(-0.1)).toBe(1.4);
  });

  it('clamps to max 3', () => {
    useSettingsStore.setState({ previewZoom: 2.95 });
    expect(zoomPreviewBy(0.1)).toBe(3);
  });

  it('clamps to min 0.5', () => {
    useSettingsStore.setState({ previewZoom: 0.55 });
    expect(zoomPreviewBy(-0.1)).toBe(0.5);
  });

  it('rounds to 2 decimals (10 steps of 0.1 from 1 gives exactly 2)', () => {
    useSettingsStore.setState({ previewZoom: 1 });
    let zoom = 1;
    for (let i = 0; i < 10; i++) {
      zoom = zoomPreviewBy(0.1);
      useSettingsStore.setState({ previewZoom: zoom });
    }
    expect(zoom).toBe(2);
  });
});

describe('resetPreviewZoom', () => {
  it('returns 1', () => {
    expect(resetPreviewZoom()).toBe(1);
  });
});

describe('useSettingsStore clear recent files', () => {
  beforeEach(() => {
    useSettingsStore.setState({ recentFiles: [] });
  });

  it('clears recent files', () => {
    const { addRecentFile, clearRecentFiles } = useSettingsStore.getState();
    addRecentFile('a.md');
    addRecentFile('b.md');
    clearRecentFiles();
    expect(useSettingsStore.getState().recentFiles).toEqual([]);
  });

  it('is a no-op when list is already empty', () => {
    const { clearRecentFiles } = useSettingsStore.getState();
    clearRecentFiles();
    expect(useSettingsStore.getState().recentFiles).toEqual([]);
  });
});
