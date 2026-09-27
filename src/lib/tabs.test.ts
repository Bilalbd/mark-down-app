import { describe, expect, it } from 'vitest';
import {
  cycleIndex,
  findTabByPath,
  flyoutSide,
  isBlankDocument,
  moveItem,
  nextActiveAfterClose,
  samePath,
  shortDir,
  tabLabels,
  tabsVisible,
} from './tabs';

describe('tabsVisible', () => {
  it('returns true in tab mode', () => {
    expect(tabsVisible('tab', 1)).toBe(true);
    expect(tabsVisible('tab', 0)).toBe(true);
  });

  it('returns false in window mode with one tab', () => {
    expect(tabsVisible('window', 1)).toBe(false);
  });

  it('returns true in window mode with more than one tab', () => {
    expect(tabsVisible('window', 2)).toBe(true);
    expect(tabsVisible('window', 5)).toBe(true);
  });

  it('returns false in window mode with no tabs', () => {
    expect(tabsVisible('window', 0)).toBe(false);
  });
});

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

  it('returns same index with zero delta', () => {
    expect(cycleIndex(3, 1, 0)).toBe(1);
  });
});

describe('samePath', () => {
  it('returns true for identical paths', () => {
    expect(samePath('C:\\a\\b.md', 'C:\\a\\b.md')).toBe(true);
    expect(samePath('/a/b.md', '/a/b.md')).toBe(true);
  });

  it('ignores case differences', () => {
    expect(samePath('C:\\A\\B.md', 'c:\\a\\b.md')).toBe(true);
    expect(samePath('/A/B.md', '/a/b.md')).toBe(true);
  });

  it('treats / and \\ as equivalent', () => {
    expect(samePath('C:\\a\\b.md', 'C:/a/b.md')).toBe(true);
    expect(samePath('C:/a\\b.md', 'c:\\a/b.md')).toBe(true);
  });

  it('ignores trailing separators', () => {
    expect(samePath('C:\\a\\b.md', 'C:\\a\\b.md\\')).toBe(true);
    expect(samePath('C:\\a\\b.md\\', 'C:\\a\\b.md/')).toBe(true);
  });

  it('returns false for different files', () => {
    expect(samePath('C:\\a\\b.md', 'C:\\a\\c.md')).toBe(false);
    expect(samePath('C:\\a\\b.md', 'D:\\a\\b.md')).toBe(false);
  });
});

describe('findTabByPath', () => {
  const tabs = [
    { id: 'tab1', path: 'C:\\a\\b.md' },
    { id: 'tab2', path: null },
    { id: 'tab3', path: 'C:\\x\\y.md' },
  ];

  it('finds a tab by exact path', () => {
    expect(findTabByPath(tabs, 'C:\\a\\b.md')).toBe('tab1');
  });

  it('finds a tab ignoring case', () => {
    expect(findTabByPath(tabs, 'c:\\a\\b.md')).toBe('tab1');
  });

  it('finds a tab treating / and \\ as equivalent', () => {
    expect(findTabByPath(tabs, 'C:/a/b.md')).toBe('tab1');
  });

  it('returns null when path is not found', () => {
    expect(findTabByPath(tabs, 'C:\\other\\file.md')).toBe(null);
  });

  it('returns the first matching tab', () => {
    const dupTabs = [
      { id: 'first', path: 'C:\\a\\b.md' },
      { id: 'second', path: 'C:\\a\\b.md' },
    ];
    expect(findTabByPath(dupTabs, 'C:\\a\\b.md')).toBe('first');
  });
});

describe('isBlankDocument', () => {
  it('returns true when hasDocument is false', () => {
    expect(
      isBlankDocument({
        hasDocument: false,
        path: 'C:\\a\\b.md',
        content: 'text',
        savedContent: 'text',
      }),
    ).toBe(true);
  });

  it('returns true for an untitled empty document', () => {
    expect(
      isBlankDocument({
        hasDocument: true,
        path: null,
        content: '',
        savedContent: '',
      }),
    ).toBe(true);
  });

  it('returns false for an untitled document with typed text', () => {
    expect(
      isBlankDocument({
        hasDocument: true,
        path: null,
        content: 'some text',
        savedContent: '',
      }),
    ).toBe(false);
  });

  it('returns false for a file', () => {
    expect(
      isBlankDocument({
        hasDocument: true,
        path: 'C:\\a\\b.md',
        content: '',
        savedContent: '',
      }),
    ).toBe(false);
  });

  it('returns false for an untitled document with savedContent', () => {
    expect(
      isBlankDocument({
        hasDocument: true,
        path: null,
        content: '',
        savedContent: 'old text',
      }),
    ).toBe(false);
  });
});

describe('nextActiveAfterClose', () => {
  it('returns activeId unchanged when closing an inactive tab', () => {
    expect(nextActiveAfterClose(['a', 'b', 'c'], 'a', 'b')).toBe('b');
  });

  it('returns the right tab when closing the active middle tab', () => {
    expect(nextActiveAfterClose(['a', 'b', 'c'], 'b', 'b')).toBe('c');
  });

  it('returns the left tab when closing the active last tab', () => {
    expect(nextActiveAfterClose(['a', 'b', 'c'], 'c', 'c')).toBe('b');
  });

  it('returns null when closing the only tab', () => {
    expect(nextActiveAfterClose(['a'], 'a', 'a')).toBe(null);
  });

  it('returns the right tab when closing the active first tab', () => {
    expect(nextActiveAfterClose(['a', 'b', 'c'], 'a', 'a')).toBe('b');
  });

  it('returns activeId when closingId is not in the list', () => {
    expect(nextActiveAfterClose(['a', 'b', 'c'], 'unknown', 'a')).toBe('a');
  });

  it('returns activeId when closingId is not found but activeId is null', () => {
    expect(nextActiveAfterClose(['a', 'b', 'c'], 'unknown', null)).toBe(null);
  });
});

describe('moveItem', () => {
  it('moves an item forward', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
  });

  it('moves an item backward', () => {
    expect(moveItem([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3]);
  });

  it('clamps to to the range [0, length - 1]', () => {
    expect(moveItem([1, 2, 3], 0, 100)).toEqual([2, 3, 1]);
  });

  it('returns unchanged copy when from === to', () => {
    const items = [1, 2, 3];
    const result = moveItem(items, 1, 1);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(items);
  });

  it('returns unchanged copy when from is out of range (negative)', () => {
    const items = [1, 2, 3];
    const result = moveItem(items, -1, 1);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(items);
  });

  it('returns unchanged copy when from is out of range (too large)', () => {
    const items = [1, 2, 3];
    const result = moveItem(items, 5, 1);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(items);
  });

  it('does not mutate the input', () => {
    const items = [1, 2, 3, 4];
    const original = [...items];
    moveItem(items, 0, 2);
    expect(items).toEqual(original);
  });
});

describe('tabLabels', () => {
  it('returns unique basenames', () => {
    expect(tabLabels(['C:\\a\\x.md', 'C:\\b\\y.md'])).toEqual(['x.md', 'y.md']);
  });

  it('labels untitled tabs with Untitled, Untitled 2, etc.', () => {
    expect(tabLabels([null, null, null])).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
  });

  it('handles a mix of untitled and named files', () => {
    const result = tabLabels([null, 'C:\\a\\x.md', null, 'C:\\b\\y.md']);
    expect(result).toEqual(['Untitled', 'x.md', 'Untitled 2', 'y.md']);
  });

  it('adds parent-folder suffix for two duplicate basenames', () => {
    const result = tabLabels(['C:\\docs\\README.md', 'C:\\api\\README.md']);
    expect(result).toEqual(['README.md · docs', 'README.md · api']);
  });

  it('adds multi-folder suffix when needed', () => {
    const result = tabLabels(['C:\\x\\one\\docs\\README.md', 'C:\\y\\two\\docs\\README.md']);
    expect(result).toEqual(['README.md · one/docs', 'README.md · two/docs']);
  });

  it('handles mixed path separators', () => {
    const result = tabLabels(['C:\\a\\README.md', 'C:/b/README.md']);
    expect(result).toEqual(['README.md · a', 'README.md · b']);
  });

  it('handles three duplicates with two sharing a parent folder', () => {
    const result = tabLabels([
      'C:\\docs\\file.txt',
      'C:\\docs\\nested\\file.txt',
      'C:\\other\\file.txt',
    ]);
    expect(result[0]).toBe('file.txt · docs');
    expect(result[2]).toBe('file.txt · other');
    // result[1] can vary but should be distinguishable
  });

  it("returns full paths as fallback for identical paths (shouldn't happen)", () => {
    const result = tabLabels(['C:\\a\\b.md', 'C:\\a\\b.md']);
    expect(result[0]).toBe('C:\\a\\b.md');
    expect(result[1]).toBe('C:\\a\\b.md');
  });

  it('handles paths with trailing separators', () => {
    const result = tabLabels(['C:\\a\\README.md\\', 'C:\\b\\README.md']);
    expect(result).toEqual(['README.md · a', 'README.md · b']);
  });

  it('handles single path', () => {
    expect(tabLabels(['C:\\a\\b.md'])).toEqual(['b.md']);
  });

  it('handles empty array', () => {
    expect(tabLabels([])).toEqual([]);
  });
});

describe('flyoutSide', () => {
  it('returns right when flyout fits on the right', () => {
    expect(flyoutSide(200, 240, 1024)).toBe('right');
  });

  it('returns left when flyout would overflow on the right', () => {
    expect(flyoutSide(800, 240, 1024)).toBe('left');
  });

  it('returns right at the boundary (just fits)', () => {
    expect(flyoutSide(780, 240, 1024)).toBe('right');
  });

  it('returns left at the boundary (just overflows)', () => {
    expect(flyoutSide(781, 240, 1024)).toBe('left');
  });

  it('handles small viewports', () => {
    expect(flyoutSide(200, 240, 400)).toBe('left');
    expect(flyoutSide(156, 240, 400)).toBe('right');
  });

  it('accounts for the 4px gap between menu and flyout', () => {
    // menuRight=100, gap=4, flyoutWidth=240 -> 100+4+240=344
    expect(flyoutSide(100, 240, 344)).toBe('right');
    expect(flyoutSide(100, 240, 343)).toBe('left');
  });
});

describe('shortDir', () => {
  it('returns full path when segments are within limit', () => {
    expect(shortDir('C:\\docs', 2)).toBe('C:\\docs');
    expect(shortDir('C:\\a\\b', 2)).toBe('C:\\a\\b');
  });

  it('truncates to last N segments with ellipsis prefix', () => {
    expect(shortDir('C:\\a\\b\\c\\d', 2)).toBe('…\\c\\d');
    expect(shortDir('C:\\a\\b\\c\\d\\e', 2)).toBe('…\\d\\e');
  });

  it('handles forward slashes', () => {
    expect(shortDir('/a/b/c/d', 2)).toBe('…/c/d');
    expect(shortDir('/a/b', 2)).toBe('/a/b');
  });

  it('preserves the original separator style', () => {
    expect(shortDir('C:\\a\\b\\c', 2)).toContain('\\');
    expect(shortDir('/a/b/c', 2)).toContain('/');
  });

  it('handles single segment paths', () => {
    expect(shortDir('C:\\file', 2)).toBe('C:\\file');
    expect(shortDir('/file', 2)).toBe('/file');
  });

  it('handles empty string', () => {
    expect(shortDir('', 2)).toBe('');
  });

  it('handles custom maxSegments', () => {
    expect(shortDir('C:\\a\\b\\c\\d\\e', 1)).toBe('…\\e');
    expect(shortDir('C:\\a\\b\\c\\d\\e', 3)).toBe('…\\c\\d\\e');
  });

  it('handles drive letters on Windows paths', () => {
    expect(shortDir('C:\\Users\\bilal\\docs', 2)).toBe('…\\bilal\\docs');
  });

  it('handles UNC paths', () => {
    expect(shortDir('\\\\server\\share\\a\\b\\c', 2)).toBe('…\\b\\c');
  });
});
