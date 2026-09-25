import { describe, it, expect } from 'vitest';
import {
  cycleIndex,
  findTabByPath,
  isBlankDocument,
  nextActiveAfterClose,
  samePath,
  tabLabels,
} from './tabs';

describe('cycleIndex', () => {
  it('returns the same index for empty or single-element lists', () => {
    expect(cycleIndex(0, 0, 1)).toBe(0);
    expect(cycleIndex(1, 0, 1)).toBe(0);
  });

  it('cycles forward through indices', () => {
    expect(cycleIndex(3, 0, 1)).toBe(1);
    expect(cycleIndex(3, 1, 1)).toBe(2);
    expect(cycleIndex(3, 2, 1)).toBe(0);
  });

  it('cycles backward through indices', () => {
    expect(cycleIndex(3, 0, -1)).toBe(2);
    expect(cycleIndex(3, 1, -1)).toBe(0);
    expect(cycleIndex(3, 2, -1)).toBe(1);
  });

  it('handles large deltas', () => {
    expect(cycleIndex(3, 0, 5)).toBe(2);
    expect(cycleIndex(3, 0, -5)).toBe(1);
  });
});

describe('samePath', () => {
  it('returns true for identical paths', () => {
    expect(samePath('/path/to/file', '/path/to/file')).toBe(true);
  });

  it('treats forward and back slashes as equal', () => {
    expect(samePath('C:\\Users\\test.md', 'C:/Users/test.md')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(samePath('C:\\USERS\\TEST.MD', 'c:\\users\\test.md')).toBe(true);
  });

  it('returns false for different paths', () => {
    expect(samePath('/path/to/file1', '/path/to/file2')).toBe(false);
  });
});

describe('findTabByPath', () => {
  const tabs = [
    { id: 'tab1', path: '/path/to/file1.md' },
    { id: 'tab2', path: '/path/to/file2.md' },
    { id: 'tab3', path: null },
  ];

  it('finds a tab by exact path', () => {
    expect(findTabByPath(tabs, '/path/to/file1.md')).toBe('tab1');
  });

  it('finds a tab by normalized path', () => {
    expect(findTabByPath(tabs, 'C:\\path\\to\\file2.md')).toBeNull();
    expect(findTabByPath(tabs, '/path/to/file2.md')).toBe('tab2');
  });

  it('returns null for non-existent paths', () => {
    expect(findTabByPath(tabs, '/nonexistent.md')).toBeNull();
  });

  it('returns null if no tab matches', () => {
    expect(findTabByPath([{ id: 'tab1', path: null }], '/some/path.md')).toBeNull();
  });
});

describe('isBlankDocument', () => {
  it('returns true for no document', () => {
    expect(isBlankDocument({ hasDocument: false, path: null, content: '', savedContent: '' })).toBe(
      true,
    );
  });

  it('returns true for empty untitled document', () => {
    expect(isBlankDocument({ hasDocument: true, path: null, content: '', savedContent: '' })).toBe(
      true,
    );
  });

  it('returns false for document with path', () => {
    expect(
      isBlankDocument({
        hasDocument: true,
        path: '/path/to/file.md',
        content: '',
        savedContent: '',
      }),
    ).toBe(false);
  });

  it('returns false for document with content', () => {
    expect(
      isBlankDocument({ hasDocument: true, path: null, content: 'hello', savedContent: '' }),
    ).toBe(false);
  });
});

describe('nextActiveAfterClose', () => {
  it('returns the active tab if it is not the closing one', () => {
    const ids = ['tab1', 'tab2', 'tab3'];
    expect(nextActiveAfterClose(ids, 'tab1', 'tab2')).toBe('tab2');
  });

  it('returns the next tab if closing the active one at the end', () => {
    const ids = ['tab1', 'tab2', 'tab3'];
    expect(nextActiveAfterClose(ids, 'tab3', 'tab3')).toBe('tab2');
  });

  it('returns the next tab if closing the active one in the middle', () => {
    const ids = ['tab1', 'tab2', 'tab3'];
    expect(nextActiveAfterClose(ids, 'tab2', 'tab2')).toBe('tab3');
  });

  it('returns the next tab if closing the active one at the start', () => {
    const ids = ['tab1', 'tab2', 'tab3'];
    expect(nextActiveAfterClose(ids, 'tab1', 'tab1')).toBe('tab2');
  });

  it('returns null if it was the only tab', () => {
    const ids = ['tab1'];
    expect(nextActiveAfterClose(ids, 'tab1', 'tab1')).toBeNull();
  });
});

describe('tabLabels', () => {
  it('returns "Untitled" for null paths', () => {
    expect(tabLabels([null, null])).toEqual(['Untitled', 'Untitled 2']);
  });

  it('returns basenames for unique files', () => {
    expect(tabLabels(['/path/to/file1.md', '/path/to/file2.md'])).toEqual(['file1.md', 'file2.md']);
  });

  it('adds parent folder suffix for duplicate basenames', () => {
    const paths = ['/folder1/README.md', '/folder2/README.md'];
    const labels = tabLabels(paths);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('README.md');
    expect(labels[1]).toContain('README.md');
    expect(labels[0]).not.toEqual(labels[1]);
  });

  it('mixes untitled and regular files', () => {
    const labels = tabLabels([null, '/path/to/file.md', null]);
    expect(labels[0]).toBe('Untitled');
    expect(labels[1]).toBe('file.md');
    expect(labels[2]).toBe('Untitled 2');
  });
});
