import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { cacheEditorState, cachedEditorState, pruneEditorCache } from './editorCache';

describe('editorCache', () => {
  beforeEach(() => {
    // Clear cache before each test by pruning everything
    pruneEditorCache([]);
  });

  it('caches and retrieves editor state', () => {
    const content = 'Hello, world!';
    const state = EditorState.create({ doc: content });

    cacheEditorState(1, state);
    const retrieved = cachedEditorState(1, content);

    expect(retrieved).toBe(state);
  });

  it('returns null when content does not match', () => {
    const state = EditorState.create({ doc: 'Hello, world!' });

    cacheEditorState(1, state);
    const retrieved = cachedEditorState(1, 'Different content');

    expect(retrieved).toBeNull();
  });

  it('returns null for missing loadId', () => {
    const retrieved = cachedEditorState(999, 'any content');
    expect(retrieved).toBeNull();
  });

  it('prunes entries not in the live set', () => {
    const state1 = EditorState.create({ doc: 'doc1' });
    const state2 = EditorState.create({ doc: 'doc2' });
    const state3 = EditorState.create({ doc: 'doc3' });

    cacheEditorState(1, state1);
    cacheEditorState(2, state2);
    cacheEditorState(3, state3);

    pruneEditorCache([1, 3]);

    expect(cachedEditorState(1, 'doc1')).toBe(state1);
    expect(cachedEditorState(2, 'doc2')).toBeNull();
    expect(cachedEditorState(3, 'doc3')).toBe(state3);
  });

  it('prunes all entries when live set is empty', () => {
    const state1 = EditorState.create({ doc: 'doc1' });
    const state2 = EditorState.create({ doc: 'doc2' });

    cacheEditorState(1, state1);
    cacheEditorState(2, state2);

    pruneEditorCache([]);

    expect(cachedEditorState(1, 'doc1')).toBeNull();
    expect(cachedEditorState(2, 'doc2')).toBeNull();
  });
});
