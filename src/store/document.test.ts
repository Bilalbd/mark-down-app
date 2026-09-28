import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockWatchFile = vi.fn().mockResolvedValue(undefined);
const mockUnwatchFile = vi.fn().mockResolvedValue(undefined);
const mockSetAssetRoot = vi.fn().mockResolvedValue(undefined);
const mockGuidePath = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);

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
    guidePath: () => mockGuidePath(),
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
    mockGuidePath.mockResolvedValue(null);
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

  it('unwatches the previous file when another one is opened', async () => {
    mockReadFile
      .mockResolvedValueOnce({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false })
      .mockResolvedValueOnce({ content: 'b', mtime: 2, encoding: 'utf8', lossy: false });

    await useDocumentStore.getState().open('C:\\docs\\a.md');
    expect(mockWatchFile).toHaveBeenLastCalledWith('C:\\docs\\a.md');

    await useDocumentStore.getState().open('C:\\docs\\b.md');
    expect(mockWatchFile).toHaveBeenLastCalledWith('C:\\docs\\b.md');
    expect(mockUnwatchFile).toHaveBeenCalledWith('C:\\docs\\a.md');
  });

  it('unwatches the current file when a new document is started', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });

    await useDocumentStore.getState().open('C:\\docs\\a.md');
    await useDocumentStore.getState().newDocument();
    expect(mockUnwatchFile).toHaveBeenCalledWith('C:\\docs\\a.md');
  });

  it('does not unwatch when the same file is reopened', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });

    await useDocumentStore.getState().open('C:\\docs\\a.md');
    mockUnwatchFile.mockClear();

    await useDocumentStore.getState().open('C:\\docs\\a.md');
    expect(mockUnwatchFile).not.toHaveBeenCalled();
  });

  it('saveAs writes to the chosen path, updates path, watches new, unwatches old, and adds to recent', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });
    mockWriteFile.mockResolvedValue(99);

    // Mock the save dialog to return a new path
    const mockDialogModule = vi.mocked(await import('@tauri-apps/plugin-dialog'), {
      partial: true,
    });
    mockDialogModule.save.mockResolvedValue('C:\\docs\\new.md');

    await useDocumentStore.getState().open('C:\\docs\\old.md');
    mockWatchFile.mockClear();
    mockUnwatchFile.mockClear();

    const ok = await useDocumentStore.getState().saveAs();

    expect(ok).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledWith('C:\\docs\\new.md', 'a', 'utf8');
    expect(useDocumentStore.getState().path).toBe('C:\\docs\\new.md');
    expect(useDocumentStore.getState().mtime).toBe(99);
    expect(mockWatchFile).toHaveBeenCalledWith('C:\\docs\\new.md');
    expect(mockUnwatchFile).toHaveBeenCalledWith('C:\\docs\\old.md');
    expect(useSettingsStore.getState().recentFiles).toContain('C:\\docs\\new.md');
  });

  it('saveAs with cancelled dialog writes nothing and leaves path unchanged', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });

    // Mock the save dialog to return null (cancelled)
    const mockDialogModule = vi.mocked(await import('@tauri-apps/plugin-dialog'), {
      partial: true,
    });
    mockDialogModule.save.mockResolvedValue(null);

    await useDocumentStore.getState().open('C:\\docs\\a.md');
    const originalPath = useDocumentStore.getState().path;
    mockWriteFile.mockClear();

    const ok = await useDocumentStore.getState().saveAs();

    expect(ok).toBe(false);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().path).toBe(originalPath);
  });

  it('saveAs suggests a name from the first heading for an untitled document', async () => {
    const mockDialogModule = vi.mocked(await import('@tauri-apps/plugin-dialog'), {
      partial: true,
    });
    mockDialogModule.save.mockResolvedValue(null); // cancel; we only care what it was called with

    useDocumentStore.setState({
      ...RESET_STATE,
      hasDocument: true,
      content: '# Meeting notes for Monday\n\nSome body text.',
    });

    await useDocumentStore.getState().saveAs();

    expect(mockDialogModule.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'Meeting notes for Monday.md' }),
    );
  });

  it('saveAs still proposes the current path for a document that has one', async () => {
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });
    const mockDialogModule = vi.mocked(await import('@tauri-apps/plugin-dialog'), {
      partial: true,
    });
    mockDialogModule.save.mockResolvedValue(null);

    await useDocumentStore.getState().open('C:\\docs\\old.md');
    await useDocumentStore.getState().saveAs();

    expect(mockDialogModule.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'C:\\docs\\old.md' }),
    );
  });

  it('reload sets error message with filename when read fails', async () => {
    mockReadFile.mockResolvedValueOnce({
      content: 'initial',
      mtime: 1,
      encoding: 'utf8',
      lossy: false,
    });

    await useDocumentStore.getState().open('C:\\docs\\test.md');
    expect(useDocumentStore.getState().error).toBeNull();

    mockReadFile.mockRejectedValueOnce(new Error('file not found'));

    await useDocumentStore.getState().reload();

    expect(useDocumentStore.getState().error).toContain('Could not reload');
    expect(useDocumentStore.getState().error).toContain('test.md');
    expect(useDocumentStore.getState().error).toContain('file not found');
  });

  it('does not add the guide to recent files when opening it', async () => {
    mockGuidePath.mockResolvedValue('C:\\guide\\Guide.md');
    mockReadFile.mockResolvedValue({
      content: '# Guide',
      mtime: 1,
      encoding: 'utf8',
      lossy: false,
    });

    await useDocumentStore.getState().open('C:\\guide\\Guide.md');

    expect(useSettingsStore.getState().recentFiles).not.toContain('C:\\guide\\Guide.md');
  });

  it('still adds an ordinary file to recent files (guide check does not affect other opens)', async () => {
    mockGuidePath.mockResolvedValue('C:\\guide\\Guide.md');
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });

    await useDocumentStore.getState().open('C:\\docs\\a.md');

    expect(useSettingsStore.getState().recentFiles).toContain('C:\\docs\\a.md');
  });

  it('save on the guide routes to Save as with a default name of Guide.md', async () => {
    mockGuidePath.mockResolvedValue('C:\\guide\\Guide.md');
    mockReadFile.mockResolvedValue({
      content: '# Guide',
      mtime: 1,
      encoding: 'utf8',
      lossy: false,
    });
    await useDocumentStore.getState().open('C:\\guide\\Guide.md');

    const mockDialogModule = vi.mocked(await import('@tauri-apps/plugin-dialog'), {
      partial: true,
    });
    mockDialogModule.save.mockResolvedValue(null); // cancel; we only care what it was called with

    await useDocumentStore.getState().save();

    expect(mockDialogModule.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'Guide.md' }),
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('saveAs refuses to write over the guide file', async () => {
    mockGuidePath.mockResolvedValue('C:\\guide\\Guide.md');
    mockReadFile.mockResolvedValue({ content: 'a', mtime: 1, encoding: 'utf8', lossy: false });
    await useDocumentStore.getState().open('C:\\docs\\a.md');

    const mockDialogModule = vi.mocked(await import('@tauri-apps/plugin-dialog'), {
      partial: true,
    });
    mockDialogModule.save.mockResolvedValue('C:\\guide\\Guide.md');

    const ok = await useDocumentStore.getState().saveAs();

    expect(ok).toBe(false);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().error).toContain('guide');
  });
});
