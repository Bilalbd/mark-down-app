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

import { useStyleStore } from './style';

describe('style persistence across windows', () => {
  beforeEach(() => {
    testState.sharedDisk.clear();
    testState.storeMemory.clear();
  });

  it("reads another window's preset change without losing the current window's change", async () => {
    // Simulate window A: load styles
    testState.sharedDisk.set('activePresetId', 'builtin-github');
    await useStyleStore.getState().load();
    expect(useStyleStore.getState().activePresetId).toBe('builtin-github');

    // Simulate window B changing the active preset on disk
    testState.sharedDisk.set('activePresetId', 'builtin-obsidian');

    // Window A makes its own preset change
    const newId = useStyleStore.getState().duplicate('builtin-github', 'My GitHub');
    useStyleStore.getState().setActive(newId);

    // Wait for the write to complete
    await new Promise((r) => setTimeout(r, 50));

    // Both changes should be in disk state
    expect(testState.sharedDisk.get('activePresetId')).toBe(newId);
    const userPresets = testState.sharedDisk.get('userPresets') as
      Array<{ id?: string }> | undefined;
    expect(userPresets).toBeDefined();
    expect(userPresets?.some((p) => p.id === newId)).toBe(true);
  });

  it('refresh picks up a new user preset from disk', async () => {
    await useStyleStore.getState().load();
    const presetCountBefore = useStyleStore.getState().presets.length;

    // Simulate another window adding a preset to disk
    const newPreset = {
      id: 'user-external',
      name: 'External',
      typography: {
        bodyFont: 'Arial',
        headingFont: '',
        monoFont: 'monospace',
        baseSize: 16,
        lineHeight: 1.5,
        contentWidth: 680,
        paragraphSpacing: 1,
        headingWeight: 700,
      },
      headingScale: [2, 1.75, 1.5, 1.25, 1, 0.875] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
      colors: {
        light: {
          bg: '#fff',
          text: '#000',
          heading: '#000',
          link: '#00f',
          muted: '#999',
          border: '#ddd',
          codeBg: '#eee',
          codeText: '#000',
          quoteBorder: '#ccc',
          quoteText: '#555',
          tableBorder: '#ddd',
          tableStripe: '#f5f5f5',
          hr: '#ddd',
        },
        dark: {
          bg: '#000',
          text: '#fff',
          heading: '#fff',
          link: '#0ff',
          muted: '#666',
          border: '#333',
          codeBg: '#222',
          codeText: '#fff',
          quoteBorder: '#444',
          quoteText: '#aaa',
          tableBorder: '#333',
          tableStripe: '#111',
          hr: '#333',
        },
      },
      customCss: '',
    };
    testState.sharedDisk.set('userPresets', [newPreset]);

    await useStyleStore.getState().refresh();

    const presetCountAfter = useStyleStore.getState().presets.length;
    expect(presetCountAfter).toBe(presetCountBefore + 1);
    expect(useStyleStore.getState().presets.some((p) => p.id === 'user-external')).toBe(true);
  });

  it('refresh skips the update if nothing changed', async () => {
    await useStyleStore.getState().load();
    const spy = vi.spyOn(useStyleStore, 'setState');

    // Refresh with no disk changes
    await useStyleStore.getState().refresh();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refresh picks up content changes in an existing user preset', async () => {
    // Create a user preset in memory
    const presetId = useStyleStore.getState().duplicate('builtin-github', 'My Preset');
    expect(useStyleStore.getState().presets.find((p) => p.id === presetId)?.colors.dark.bg).toBe(
      '#0d1117',
    );

    // Simulate another window editing the preset on disk
    const userPresets = [
      {
        id: presetId,
        name: 'My Preset',
        typography: {
          bodyFont: 'Arial',
          headingFont: '',
          monoFont: 'monospace',
          baseSize: 16,
          lineHeight: 1.5,
          contentWidth: 680,
          paragraphSpacing: 1,
          headingWeight: 700,
        },
        headingScale: [2, 1.75, 1.5, 1.25, 1, 0.875] as [
          number,
          number,
          number,
          number,
          number,
          number,
        ],
        colors: {
          light: {
            bg: '#fff',
            text: '#000',
            heading: '#000',
            link: '#00f',
            muted: '#999',
            border: '#ddd',
            codeBg: '#eee',
            codeText: '#000',
            quoteBorder: '#ccc',
            quoteText: '#555',
            tableBorder: '#ddd',
            tableStripe: '#f5f5f5',
            hr: '#ddd',
          },
          dark: {
            bg: '#ff0000',
            text: '#fff',
            heading: '#fff',
            link: '#0ff',
            muted: '#666',
            border: '#333',
            codeBg: '#222',
            codeText: '#fff',
            quoteBorder: '#444',
            quoteText: '#aaa',
            tableBorder: '#333',
            tableStripe: '#111',
            hr: '#333',
          },
        },
        customCss: '',
      },
    ];
    testState.sharedDisk.set('userPresets', userPresets);

    // Refresh should pick up the color change
    await useStyleStore.getState().refresh();
    expect(useStyleStore.getState().presets.find((p) => p.id === presetId)?.colors.dark.bg).toBe(
      '#ff0000',
    );
  });
});
