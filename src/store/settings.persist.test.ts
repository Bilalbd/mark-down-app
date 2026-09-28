import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Tauri store with a shared disk and per-store memory
const testState = {
  sharedDisk: new Map<string, unknown>(),
  storeMemory: new Map<string, unknown>(),
};

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => {
    // Initialize memory from disk when store is created
    testState.storeMemory.clear();
    testState.sharedDisk.forEach((v, k) => testState.storeMemory.set(k, v));

    return {
      reload: vi.fn(async () => {
        // Copy disk → memory
        testState.storeMemory.clear();
        testState.sharedDisk.forEach((v, k) => testState.storeMemory.set(k, v));
      }),
      set: vi.fn(async (k: string, v: unknown) => {
        testState.storeMemory.set(k, v);
      }),
      get: vi.fn(async (k: string) => testState.storeMemory.get(k)),
      save: vi.fn(async () => {
        // Copy memory → disk
        testState.storeMemory.forEach((v, k) => testState.sharedDisk.set(k, v));
      }),
      entries: vi.fn(async () => Array.from(testState.storeMemory.entries())),
    };
  }),
}));

import { useSettingsStore, whenSettingsWritten } from './settings';

describe('settings persistence across windows', () => {
  beforeEach(() => {
    testState.sharedDisk.clear();
    testState.storeMemory.clear();
  });

  it("reads another window's write without losing the current window's change", async () => {
    // Simulate window A: load settings
    testState.sharedDisk.set('outlineWidth', 250);
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().outlineWidth).toBe(250);

    // Simulate window B changing something on disk
    testState.sharedDisk.set('appTheme', 'light');

    // Window A writes its own change
    useSettingsStore.getState().set('outlineWidth', 260);
    await whenSettingsWritten();

    // Both changes should be on disk
    expect(testState.sharedDisk.get('outlineWidth')).toBe(260);
    expect(testState.sharedDisk.get('appTheme')).toBe('light');
  });

  it('preserves order when two writes happen in quick succession', async () => {
    useSettingsStore.getState().set('appTheme', 'light');
    useSettingsStore.getState().set('outlineWidth', 300);
    await whenSettingsWritten();

    expect(testState.sharedDisk.get('appTheme')).toBe('light');
    expect(testState.sharedDisk.get('outlineWidth')).toBe(300);
  });

  it('refreshAll picks up disk changes without re-rendering if nothing changed', async () => {
    testState.sharedDisk.set('appTheme', 'dark');
    await useSettingsStore.getState().load();
    // `load` reads the cached store's memory, so sync state with the fake disk first. The store's
    // internal updates bypass `useSettingsStore.setState`, so compare state identity instead of
    // spying on it.
    await useSettingsStore.getState().refreshAll();
    const before = useSettingsStore.getState();

    // Refresh with no disk changes
    await useSettingsStore.getState().refreshAll();
    expect(useSettingsStore.getState()).toBe(before);
  });

  it('refreshAll picks up a disk change from another window', async () => {
    testState.sharedDisk.set('appTheme', 'dark');
    await useSettingsStore.getState().load();

    // Simulate another window changing the disk
    testState.sharedDisk.set('appTheme', 'light');

    await useSettingsStore.getState().refreshAll();
    expect(useSettingsStore.getState().appTheme).toBe('light');
  });

  it('refreshAll ignores viewMode even if disk has it', async () => {
    testState.sharedDisk.set('viewMode', 'source');
    await useSettingsStore.getState().load();

    // Refresh with viewMode on disk
    await useSettingsStore.getState().refreshAll();

    // viewMode should still be formatted because it's ephemeral
    expect(useSettingsStore.getState().viewMode).toBe('formatted');
  });

  it('refreshAll compares arrays by value using JSON.stringify', async () => {
    testState.sharedDisk.set('recentFiles', ['a.md', 'b.md']);
    await useSettingsStore.getState().load();

    await useSettingsStore.getState().refreshAll();
    const before = useSettingsStore.getState();
    // Identical data on disk (a new array with the same entries) - should not re-render
    testState.sharedDisk.set('recentFiles', ['a.md', 'b.md']);
    await useSettingsStore.getState().refreshAll();

    expect(useSettingsStore.getState()).toBe(before);
  });

  it('persists splitCursorMirror like the other booleans', async () => {
    useSettingsStore.getState().set('splitCursorMirror', true);
    await whenSettingsWritten();
    expect(testState.sharedDisk.get('splitCursorMirror')).toBe(true);

    // Reset for other tests.
    useSettingsStore.getState().set('splitCursorMirror', false);
    await whenSettingsWritten();
    expect(testState.sharedDisk.get('splitCursorMirror')).toBe(false);
  });

  it('persists the spelling array keys like other array keys (e.g. recentFiles)', async () => {
    useSettingsStore.getState().set('spellLanguages', ['en-US', 'ar-SA']);
    useSettingsStore.getState().set('spellWords', ['teh']);
    await whenSettingsWritten();

    expect(testState.sharedDisk.get('spellLanguages')).toEqual(['en-US', 'ar-SA']);
    expect(testState.sharedDisk.get('spellWords')).toEqual(['teh']);

    // Reset for other tests.
    useSettingsStore.getState().set('spellLanguages', []);
    useSettingsStore.getState().set('spellWords', []);
    await whenSettingsWritten();
  });

  it('a change made while a refresh is queued is neither reverted nor blocked', async () => {
    // `load` reads the cached store's memory, so sync state with the fake disk via a refresh.
    testState.sharedDisk.set('outlineWidth', 240);
    testState.sharedDisk.set('editorFontSize', 14);
    await useSettingsStore.getState().refreshAll();
    expect(useSettingsStore.getState().outlineWidth).toBe(240);

    const refreshed = useSettingsStore.getState().refreshAll();
    useSettingsStore.getState().set('outlineWidth', 300);
    useSettingsStore.getState().set('editorFontSize', 15);

    const timeout = (p: Promise<unknown>) =>
      Promise.race([
        p.then(() => 'settled'),
        new Promise<string>((resolve) => setTimeout(() => resolve('timed out'), 1000)),
      ]);
    expect(await timeout(refreshed)).toBe('settled');
    expect(await timeout(whenSettingsWritten())).toBe('settled');
    expect(useSettingsStore.getState().outlineWidth).toBe(300);
    expect(testState.sharedDisk.get('outlineWidth')).toBe(300);
    expect(testState.sharedDisk.get('editorFontSize')).toBe(15);
  });
});
