import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { hasUnsavedTabs, newDocumentPerSetting, openPath, openPaths, routeExternalOpen, useTabsStore } from '@/store/tabs';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockWatchFile = vi.fn().mockResolvedValue(undefined);
const mockUnwatchFile = vi.fn().mockResolvedValue(undefined);
const mockSetAssetRoot = vi.fn().mockResolvedValue(undefined);
const mockOpenInNewWindow = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    isTauri: () => true,
    readFile: (...args: Parameters<typeof actual.readFile>) => mockReadFile(...args),
    writeFile: (...args: Parameters<typeof actual.writeFile>) => mockWriteFile(...args),
    watchFile: (...args: Parameters<typeof actual.watchFile>) => mockWatchFile(...args),
    unwatchFile: (...args: Parameters<typeof actual.unwatchFile>) => mockUnwatchFile(...args),
    setAssetRoot: (...args: Parameters<typeof actual.setAssetRoot>) => mockSetAssetRoot(...args),
    openInNewWindow: (...args: Parameters<typeof actual.openInNewWindow>) => mockOpenInNewWindow(...args),
  };
});

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

const mockAskSaveChanges = vi.fn();
vi.mock('@/components/Dialog/ConfirmDialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Dialog/ConfirmDialog')>();
  return {
    ...actual,
    askSaveChanges: (...args: Parameters<typeof actual.askSaveChanges>) =>
      mockAskSaveChanges(...args),
  };
});

const RESET_DOC_STATE = {
  path: null,
  hasDocument: false,
  content: '',
  savedContent: '',
  mtime: 0,
  eol: '\n' as const,
  encoding: 'utf8' as const,
  lossy: false,
  loadId: 0,
  error: null,
  externalChange: null,
};

describe('tabs store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAskSaveChanges.mockResolvedValue('discard');
    useDocumentStore.setState(RESET_DOC_STATE);
    useSettingsStore.setState({ viewMode: 'formatted' });
    useViewStore.setState({ topLine: 0 });
    useTabsStore.setState({ tabs: [{ id: 't0', snapshot: null }], activeId: 't0' });
    mockReadFile.mockImplementation((path: string) =>
      Promise.resolve({
        content: `# ${path}`,
        mtime: 1,
        encoding: 'utf8' as const,
        lossy: false,
      }),
    );
  });

  it('C1: opening A then B gives two tabs, B active; activate(A) restores A', async () => {
    mockReadFile.mockImplementation((path: string) =>
      Promise.resolve({
        content: `# ${path}`,
        mtime: 1,
        encoding: 'utf8' as const,
        lossy: false,
      }),
    );

    useSettingsStore.getState().set('viewMode', 'source');
    useViewStore.setState({ topLine: 5 });

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\A.md');
    expect(useSettingsStore.getState().viewMode).toBe('formatted');

    useSettingsStore.getState().set('viewMode', 'source');
    useViewStore.setState({ topLine: 5 });

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useTabsStore.getState().activeId).toBe(useTabsStore.getState().tabs[1].id);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\B.md');

    const aTabId = useTabsStore.getState().tabs[0].id;
    await useTabsStore.getState().activate(aTabId);

    expect(useDocumentStore.getState().path).toBe('C:\\docs\\A.md');
    expect(useSettingsStore.getState().viewMode).toBe('source');
    expect(useViewStore.getState().topLine).toBe(5);
  });

  it('C2: opening A while start screen is showing reuses tab', async () => {
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().hasDocument).toBe(false);

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\A.md');
  });

  it('C3: opening A again with different case/slashes activates tab without re-reading', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    mockReadFile.mockClear();

    await useTabsStore.getState().openInTab('c:/docs/a.md');
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('C4: newTab on start screen creates document instead of tab', async () => {
    expect(useDocumentStore.getState().hasDocument).toBe(false);
    await useTabsStore.getState().newTab();

    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().hasDocument).toBe(true);
    expect(useSettingsStore.getState().viewMode).toBe('source');
  });

  it('C4: newTab with file open adds tab in source view', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().newTab();

    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useDocumentStore.getState().path).toBeNull();
    expect(useDocumentStore.getState().hasDocument).toBe(true);
    expect(useSettingsStore.getState().viewMode).toBe('source');
  });

  it('C5: closing clean inactive tab removes it without asking', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().openInTab('C:\\docs\\B.md');

    const aTabId = useTabsStore.getState().tabs[0].id;
    const closed = await useTabsStore.getState().close(aTabId);

    expect(closed).toBe(true);
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(mockAskSaveChanges).not.toHaveBeenCalled();
    expect(mockUnwatchFile).toHaveBeenCalledWith('C:\\docs\\A.md');
  });

  it('C6: closing dirty inactive tab activates then asks', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().openInTab('C:\\docs\\B.md');

    const aTabId = useTabsStore.getState().tabs[0].id;
    const aSnapshot = useTabsStore.getState().tabs[0].snapshot;

    if (aSnapshot) {
      useTabsStore.setState({
        tabs: useTabsStore.getState().tabs.map((t) =>
          t.id === aTabId && t.snapshot
            ? {
                id: t.id,
                snapshot: {
                  doc: { ...t.snapshot.doc, content: 'edited', savedContent: '' },
                  viewMode: t.snapshot.viewMode,
                  topLine: t.snapshot.topLine,
                  needsReload: t.snapshot.needsReload,
                },
              }
            : t,
        ),
      });
    }

    mockAskSaveChanges.mockResolvedValueOnce(null);
    const closed = await useTabsStore.getState().close(aTabId);

    expect(closed).toBe(false);
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(mockAskSaveChanges).toHaveBeenCalled();
  });

  it('C7: closing active middle tab activates right; closing last leaves start screen', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    await useTabsStore.getState().openInTab('C:\\docs\\C.md');

    const bTabId = useTabsStore.getState().tabs[1].id;
    await useTabsStore.getState().activate(bTabId);

    const closed = await useTabsStore.getState().close(bTabId);
    expect(closed).toBe(true);
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\C.md');

    // Close last two tabs
    const aTabId = useTabsStore.getState().tabs[0].id;
    const cTabId = useTabsStore.getState().tabs[1].id;
    await useTabsStore.getState().close(cTabId);
    expect(useTabsStore.getState().tabs).toHaveLength(1);

    await useTabsStore.getState().close(aTabId);
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().hasDocument).toBe(false);
  });

  it('C8: confirmCloseAll with dirty tabs asks each in order', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    useDocumentStore.getState().setContent('edited in A');

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    useDocumentStore.getState().setContent('edited in B');

    mockAskSaveChanges.mockResolvedValueOnce('discard').mockResolvedValueOnce('discard');
    const result = await useTabsStore.getState().confirmCloseAll();

    expect(result).toBe(true);
    expect(mockAskSaveChanges).toHaveBeenCalledTimes(2);
  });

  it('C8: confirmCloseAll returns false on cancel', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    useDocumentStore.getState().setContent('edited in A');

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    useDocumentStore.getState().setContent('edited in B');

    mockAskSaveChanges.mockResolvedValueOnce('discard').mockResolvedValueOnce(null);
    const result = await useTabsStore.getState().confirmCloseAll();

    expect(result).toBe(false);
  });

  it('C9: onInactiveFileChanged sets needsReload for clean tab', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    const aTabId = useTabsStore.getState().tabs[0].id;
    const aMtime = useDocumentStore.getState().mtime;

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');

    useTabsStore.getState().onInactiveFileChanged({
      path: 'C:\\docs\\A.md',
      mtime: aMtime + 1,
      removed: false,
    });

    const aSnapshot = useTabsStore.getState().tabs[0].snapshot;
    expect(aSnapshot?.needsReload).toBe(true);

    mockReadFile.mockResolvedValueOnce({
      content: '# A reloaded',
      mtime: aMtime + 1,
      encoding: 'utf8' as const,
      lossy: false,
    });

    await useTabsStore.getState().activate(aTabId);
    expect(useDocumentStore.getState().content).toBe('# A reloaded');
  });

  it('C9: onInactiveFileChanged sets externalChange for dirty tab', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    const aMtime = useDocumentStore.getState().mtime;

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');

    const aTabId = useTabsStore.getState().tabs[0].id;
    const aSnapshot = useTabsStore.getState().tabs[0].snapshot;
    if (aSnapshot) {
      useTabsStore.setState({
        tabs: useTabsStore.getState().tabs.map((t) =>
          t.id === aTabId && t.snapshot
            ? {
                id: t.id,
                snapshot: {
                  doc: { ...t.snapshot.doc, content: 'edited', savedContent: 'original' },
                  viewMode: t.snapshot.viewMode,
                  topLine: t.snapshot.topLine,
                  needsReload: t.snapshot.needsReload,
                },
              }
            : t,
        ),
      });
    }

    useTabsStore.getState().onInactiveFileChanged({
      path: 'C:\\docs\\A.md',
      mtime: aMtime + 1,
      removed: false,
    });

    const updated = useTabsStore.getState().tabs[0].snapshot;
    expect(updated?.doc.externalChange).toBe('modified');
  });

  it('C9: onInactiveFileChanged sets removed', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().openInTab('C:\\docs\\B.md');

    useTabsStore.getState().onInactiveFileChanged({
      path: 'C:\\docs\\A.md',
      mtime: 0,
      removed: true,
    });

    const aSnapshot = useTabsStore.getState().tabs[0].snapshot;
    expect(aSnapshot?.doc.externalChange).toBe('removed');
  });

  it('C10: switching tabs calls setAssetRoot with folder or null', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    expect(mockSetAssetRoot).toHaveBeenCalledWith('C:\\docs');

    mockSetAssetRoot.mockClear();
    await useTabsStore.getState().newTab();
    expect(mockSetAssetRoot).toHaveBeenCalledWith(null);
  });

  it('C11: failed open in new tab removes tab and restores previous', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    useDocumentStore.getState().setContent('A content');

    mockReadFile.mockRejectedValueOnce(new Error('not found'));

    const ok = await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    expect(ok).toBe(false);
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\A.md');
    expect(useDocumentStore.getState().content).toBe('A content');
    expect(useDocumentStore.getState().error).toContain('not found');
  });

  it('C12: Save As onto dirty tab path is blocked', async () => {
    const mockSaveDialog = await vi.importMock<typeof import('@tauri-apps/plugin-dialog')>(
      '@tauri-apps/plugin-dialog',
    );
    (mockSaveDialog.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce('C:\\docs\\B.md');

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    useDocumentStore.getState().setContent('B content edited');

    await useTabsStore.getState().openInTab('C:\\docs\\C.md');
    useDocumentStore.getState().setContent('C content');

    const ok = await useDocumentStore.getState().saveAs();
    expect(ok).toBe(false);
    expect(useDocumentStore.getState().error).toContain('another tab');
  });

  it('C12: Save As onto clean tab path removes that tab and writes', async () => {
    const mockSaveDialog = await vi.importMock<typeof import('@tauri-apps/plugin-dialog')>(
      '@tauri-apps/plugin-dialog',
    );
    mockWriteFile.mockResolvedValueOnce(2);
    (mockSaveDialog.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce('C:\\docs\\B.md');

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    useDocumentStore.getState().setContent('B content saved');

    // Save B to disk
    await useDocumentStore.getState().save();

    // Open C
    await useTabsStore.getState().openInTab('C:\\docs\\C.md');
    expect(useTabsStore.getState().tabs).toHaveLength(3);

    // Save As C to B's path
    useDocumentStore.getState().setContent('C content');
    const ok = await useDocumentStore.getState().saveAs();

    expect(ok).toBe(true);
    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('C13: move reorders tabs', () => {
    useTabsStore.setState({
      tabs: [
        { id: 't0', snapshot: null },
        { id: 't1', snapshot: null },
        { id: 't2', snapshot: null },
      ],
    });

    useTabsStore.getState().move(0, 1);

    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual(['t1', 't0', 't2']);
  });

  it('regression: confirmCloseAll with inactive dirty before active dirty, saving first, asks both correctly', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    useDocumentStore.getState().setContent('A edited');

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    useDocumentStore.getState().setContent('B edited');

    mockWriteFile.mockResolvedValue(1);
    mockAskSaveChanges.mockResolvedValueOnce('save').mockResolvedValueOnce('discard');

    const result = await useTabsStore.getState().confirmCloseAll();

    expect(result).toBe(true);
    expect(mockAskSaveChanges).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).toHaveBeenCalledOnce();
  });

  it('regression: activate re-reads state after asset-root await', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().openInTab('C:\\docs\\B.md');

    const aId = useTabsStore.getState().tabs[0].id;
    let release!: () => void;
    mockSetAssetRoot.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const pending = useTabsStore.getState().activate(aId);

    useTabsStore.getState().onInactiveFileChanged({
      path: 'C:\\docs\\A.md',
      mtime: 999,
      removed: false,
    });

    mockReadFile.mockClear();
    mockReadFile.mockResolvedValueOnce({
      content: '# Reloaded A',
      mtime: 999,
      encoding: 'utf8' as const,
      lossy: false,
    });
    release();
    await pending;

    expect(mockReadFile).toHaveBeenCalledWith('C:\\docs\\A.md');
    expect(useDocumentStore.getState().content).toBe('# Reloaded A');
  });

  it('hasUnsavedTabs: false when clean', () => {
    expect(hasUnsavedTabs()).toBe(false);
  });

  it('hasUnsavedTabs: true when active tab dirty', () => {
    useDocumentStore.getState().setContent('edited');
    expect(hasUnsavedTabs()).toBe(true);
  });

  it('hasUnsavedTabs: true when snapshot tab dirty', async () => {
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    useDocumentStore.getState().setContent('A content');

    await useTabsStore.getState().openInTab('C:\\docs\\B.md');

    // Now A tab is inactive. Mark it dirty by setting content and checking state
    useTabsStore.setState({
      tabs: useTabsStore.getState().tabs.map((t) =>
        t.snapshot && t.snapshot.doc.path === 'C:\\docs\\A.md'
          ? {
              ...t,
              snapshot: { ...t.snapshot, doc: { ...t.snapshot.doc, content: 'A edited' } },
            }
          : t,
      ),
    });

    expect(hasUnsavedTabs()).toBe(true);
  });

  it('openPath in tab mode opens a second tab', async () => {
    useSettingsStore.setState({ openFilesIn: 'tab' });

    const ok = await openPath('C:\\docs\\A.md');

    expect(ok).toBe(true);
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\A.md');
  });

  it('openPath in window mode replaces active document', async () => {
    useSettingsStore.setState({ openFilesIn: 'window' });

    mockAskSaveChanges.mockResolvedValueOnce('discard');

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    const tabCountBefore = useTabsStore.getState().tabs.length;

    const ok = await openPath('C:\\docs\\B.md');

    expect(ok).toBe(true);
    expect(useTabsStore.getState().tabs).toHaveLength(tabCountBefore);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\B.md');
  });

  it('openPath in window mode with file already open in another tab, activates that tab', async () => {
    useSettingsStore.setState({ openFilesIn: 'window' });

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    await useTabsStore.getState().openInTab('C:\\docs\\B.md');
    const bId = useTabsStore.getState().activeId;

    // Back to A
    const aId = useTabsStore.getState().tabs[0].id;
    await useTabsStore.getState().activate(aId);

    // Open B path (should activate existing tab)
    const ok = await openPath('C:\\docs\\B.md');

    expect(ok).toBe(true);
    expect(useTabsStore.getState().activeId).toBe(bId);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\B.md');
  });

  it('newDocumentPerSetting in tab mode creates new tab in source view', async () => {
    useSettingsStore.setState({ openFilesIn: 'tab' });

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    useSettingsStore.getState().set('viewMode', 'formatted');

    await newDocumentPerSetting();

    expect(useTabsStore.getState().tabs).toHaveLength(2);
    expect(useDocumentStore.getState().path).toBeNull();
    expect(useDocumentStore.getState().hasDocument).toBe(true);
    expect(useSettingsStore.getState().viewMode).toBe('source');
  });

  it('newDocumentPerSetting in window mode replaces current document and sets source view', async () => {
    useSettingsStore.setState({ openFilesIn: 'window' });

    mockAskSaveChanges.mockResolvedValueOnce('discard');

    await useTabsStore.getState().openInTab('C:\\docs\\A.md');
    useSettingsStore.getState().set('viewMode', 'formatted');
    const tabCountBefore = useTabsStore.getState().tabs.length;

    await newDocumentPerSetting();

    expect(useTabsStore.getState().tabs).toHaveLength(tabCountBefore);
    expect(useDocumentStore.getState().path).toBeNull();
    expect(useDocumentStore.getState().hasDocument).toBe(true);
    expect(useSettingsStore.getState().viewMode).toBe('source');
  });

  it('openPaths in tab mode opens all files as tabs sequentially', async () => {
    useSettingsStore.setState({ openFilesIn: 'tab' });

    await openPaths(['C:\\docs\\A.md', 'C:\\docs\\B.md', 'C:\\docs\\C.md']);

    expect(useTabsStore.getState().tabs).toHaveLength(3);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\C.md');
  });

  it('openPaths in window mode opens only the first file', async () => {
    useSettingsStore.setState({ openFilesIn: 'window' });

    mockAskSaveChanges.mockResolvedValueOnce('discard');

    const tabCountBefore = useTabsStore.getState().tabs.length;
    await openPaths(['C:\\docs\\A.md', 'C:\\docs\\B.md']);

    expect(useTabsStore.getState().tabs).toHaveLength(tabCountBefore);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\A.md');
  });

  it('routeExternalOpen in tab mode opens a tab', async () => {
    useSettingsStore.setState({ openFilesIn: 'tab' });

    await routeExternalOpen('C:\\docs\\A.md');

    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\A.md');
    expect(mockReadFile).toHaveBeenCalledWith('C:\\docs\\A.md');
    expect(mockOpenInNewWindow).not.toHaveBeenCalled();
  });

  it('routeExternalOpen in window mode calls openInNewWindow', async () => {
    useSettingsStore.setState({ openFilesIn: 'window' });
    await useTabsStore.getState().openInTab('C:\\docs\\A.md');

    const tabCountBefore = useTabsStore.getState().tabs.length;
    await routeExternalOpen('C:\\docs\\B.md');

    expect(mockOpenInNewWindow).toHaveBeenCalledWith('C:\\docs\\B.md');
    expect(useTabsStore.getState().tabs).toHaveLength(tabCountBefore);
  });

  it('routeExternalOpen in window mode sets error when openInNewWindow rejects', async () => {
    useSettingsStore.setState({ openFilesIn: 'window' });
    mockOpenInNewWindow.mockRejectedValueOnce(new Error('spawn failed'));

    await routeExternalOpen('C:\\docs\\A.md');

    expect(useDocumentStore.getState().error).toContain('Could not open');
    expect(useDocumentStore.getState().error).toContain('spawn failed');
  });
});
