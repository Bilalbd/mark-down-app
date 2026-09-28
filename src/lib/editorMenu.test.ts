import { describe, it, expect } from 'vitest';
import { findMenuItem, type MenuEntry } from '@/components/ContextMenu/ContextMenu';
import { buildEditorMenu, MAX_SUGGESTIONS } from './editorMenu';

function ids(items: MenuEntry[]): string[] {
  return items.map((i) => i.id);
}

describe('buildEditorMenu', () => {
  it('omits the suggestions block entirely when there is no misspelling', () => {
    const items = buildEditorMenu({ misspelling: null, suggestions: [], hasSelection: false });
    expect(ids(items)).not.toContain('no-suggestions');
    expect(ids(items)).not.toContain('add-to-dictionary');
    expect(ids(items)).not.toContain('ignore');
    expect(items[0].id).toBe('cut');
  });

  it('shows a disabled "No suggestions" item when misspelled but nothing suggested', () => {
    const items = buildEditorMenu({
      misspelling: { word: 'teh' },
      suggestions: [],
      hasSelection: false,
    });
    const noSuggestions = findMenuItem(items, 'no-suggestions');
    expect(noSuggestions?.disabled).toBe(true);
    expect(findMenuItem(items, 'add-to-dictionary')).toBeDefined();
    expect(findMenuItem(items, 'ignore')).toBeDefined();
  });

  it('lists suggestions with the first one bold, capped at MAX_SUGGESTIONS', () => {
    const suggestions = ['the', 'ten', 'tea', 'tech', 'teal', 'text', 'tex'];
    const items = buildEditorMenu({
      misspelling: { word: 'teh' },
      suggestions,
      hasSelection: false,
    });
    const shown = suggestions
      .slice(0, MAX_SUGGESTIONS)
      .map((_, i) => findMenuItem(items, `suggestion-${i}`));
    expect(shown.every((i) => i !== undefined)).toBe(true);
    expect(shown.map((i) => i!.label)).toEqual(suggestions.slice(0, MAX_SUGGESTIONS));
    expect(shown[0]!.bold).toBe(true);
    expect(shown[1]!.bold).toBeFalsy();
    expect(findMenuItem(items, `suggestion-${MAX_SUGGESTIONS}`)).toBeUndefined();
  });

  it('disables Cut and Copy without a selection, and leaves Paste enabled', () => {
    const items = buildEditorMenu({ misspelling: null, suggestions: [], hasSelection: false });
    expect(findMenuItem(items, 'cut')?.disabled).toBe(true);
    expect(findMenuItem(items, 'copy')?.disabled).toBe(true);
    expect(findMenuItem(items, 'paste')?.disabled).toBeFalsy();
  });

  it('enables Cut and Copy with a selection', () => {
    const items = buildEditorMenu({ misspelling: null, suggestions: [], hasSelection: true });
    expect(findMenuItem(items, 'cut')?.disabled).toBeFalsy();
    expect(findMenuItem(items, 'copy')?.disabled).toBeFalsy();
  });

  it('has a Heading submenu with levels 1-6 then Paragraph, and no shortcut on Paragraph', () => {
    const items = buildEditorMenu({ misspelling: null, suggestions: [], hasSelection: false });
    const heading = findMenuItem(items, 'heading');
    expect(heading?.submenu).toBeDefined();
    expect(ids(heading!.submenu!)).toEqual([
      'heading-1',
      'heading-2',
      'heading-3',
      'heading-4',
      'heading-5',
      'heading-6',
      'heading-0',
    ]);
    const paragraph = findMenuItem(items, 'heading-0');
    expect(paragraph?.label).toBe('Paragraph');
    expect(paragraph?.shortcut).toBeUndefined();
    const h1 = findMenuItem(items, 'heading-1');
    expect(h1?.shortcut).toBe('Ctrl+Shift+1');
  });

  it('includes every formatting item once', () => {
    const items = buildEditorMenu({ misspelling: null, suggestions: [], hasSelection: false });
    for (const id of [
      'bold',
      'italic',
      'strikethrough',
      'inline-code',
      'link',
      'code-block',
      'quote',
      'list-bullet',
      'list-ordered',
      'list-task',
      'horizontal-rule',
    ]) {
      expect(findMenuItem(items, id)).toBeDefined();
    }
  });
});
