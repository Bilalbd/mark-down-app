import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockWatchFile = vi.fn().mockResolvedValue(undefined);
const mockUnwatchFile = vi.fn().mockResolvedValue(undefined);
const mockSetAssetRoot = vi.fn().mockResolvedValue(undefined);

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

const RESET_STATE = {
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

describe('document store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAskSaveChanges.mockResolvedValue('discard');
    useDocumentStore.setState(RESET_STATE);
    useSettingsStore.setState({ recentFiles: [] });
  });

  it('opening a CRLF file normalises it to LF and is not dirty; save restores CRLF', async () => {
    mockReadFile.mockResolvedValue({
      content: '# T\r\n\r\nbody\r\n',
      mtime: 1,
      encoding: 'utf8',
      lossy: false,
    });
    mockWriteFile.mockResolvedValue(2);

    const ok = await useDocumentStore.getState().open('C:\\docs\\a.md');
    expect(ok).toBe(true);

    const s = useDocumentStore.getState();
    expect(s.content).toBe('# T\n\nbody\n');
    expect(s.content).toBe(s.savedContent); // not dirty

    await useDocumentStore.getState().save();
    expect(mockWriteFile).toHaveBeenCalledWith('C:\\docs\\a.md', '# T\r\n\r\nbody\r\n', 'utf8');
  });

  it('increments loadId on open/newDocument/reload but not on save', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });
    mockWriteFile.mockResolvedValue(2);

    await useDocumentStore.getState().open('C:\\docs\\a.md');
    const afterOpen = useDocumentStore.getState().loadId;
    expect(afterOpen).toBeGreaterThan(0);

    useDocumentStore.getState().setContent('a edited');
    await useDocumentStore.getState().save();
    expect(useDocumentStore.getState().loadId).toBe(afterOpen);

    mockReadFile.mockResolvedValue({ content: 'a', mtime: 3, encoding: 'utf8', lossy: false });
    await useDocumentStore.getState().reload();
    expect(useDocumentStore.getState().loadId).toBe(afterOpen + 1);

    await useDocumentStore.getState().newDocument();
    expect(useDocumentStore.getState().loadId).toBe(afterOpen + 2);
  });

  it('handles file-changed events: ignores our own mtime, flags while dirty, reloads while clean', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });
    await useDocumentStore.getState().open('C:\\docs\\a.md');

    await useDocumentStore
      .getState()
      .onFileChanged({ path: 'C:\\docs\\a.md', mtime: 1, removed: false });
    expect(useDocumentStore.getState().externalChange).toBeNull();

    useDocumentStore.getState().setContent('a edited');
    await useDocumentStore
      .getState()
      .onFileChanged({ path: 'C:\\docs\\a.md', mtime: 2, removed: false });
    expect(useDocumentStore.getState().externalChange).toBe('modified');

    useDocumentStore.setState({ content: 'a', savedContent: 'a', externalChange: null });
    mockReadFile.mockResolvedValue({
      content: 'reloaded',
      mtime: 3,
      encoding: 'utf8',
      lossy: false,
    });
    await useDocumentStore
      .getState()
      .onFileChanged({ path: 'C:\\docs\\a.md', mtime: 3, removed: false });
    expect(useDocumentStore.getState().content).toBe('reloaded');
    expect(useDocumentStore.getState().externalChange).toBeNull();
  });

  it('drops an unreadable path from recent files on open failure', async () => {
    mockReadFile.mockRejectedValue(new Error('boom'));
    useSettingsStore.getState().addRecentFile('C:\\docs\\missing.md');
    expect(useSettingsStore.getState().recentFiles).toContain('C:\\docs\\missing.md');

    const ok = await useDocumentStore.getState().open('C:\\docs\\missing.md');
    expect(ok).toBe(false);
    expect(useSettingsStore.getState().recentFiles).not.toContain('C:\\docs\\missing.md');
    expect(useDocumentStore.getState().error).toContain('missing.md');
  });

  it('asks for confirmation before saving a lossy file, and only writes when confirmed', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: true });
    mockWriteFile.mockResolvedValue(2);
    await useDocumentStore.getState().open('C:\\docs\\a.md');
    expect(useDocumentStore.getState().lossy).toBe(true);

    const cancelled = useDocumentStore.getState().save();
    useDialogStore.getState().close('cancel');
    expect(await cancelled).toBe(false);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().lossy).toBe(true);

    const confirmed = useDocumentStore.getState().save();
    useDialogStore.getState().close('save');
    expect(await confirmed).toBe(true);
    expect(mockWriteFile).toHaveBeenCalled();
    expect(useDocumentStore.getState().lossy).toBe(false);
  });
});
