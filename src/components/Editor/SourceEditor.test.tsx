import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EMPTY_DOC, useDocumentStore } from '@/store/document';
import { useViewStore } from '@/store/view';
import { SourceEditor, needsExternalSync } from './SourceEditor';

// Mock CodeMirror dependencies that aren't needed for these tests
vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('SourceEditor', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      useDocumentStore.setState({
        ...EMPTY_DOC,
        hasDocument: true,
        content: 'line 1\nline 2\nline 3',
        loadId: 1,
      });
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('sets cursor immediately after mounting', () => {
    act(() => {
      root.render(<SourceEditor />);
    });

    const cursor = useViewStore.getState().cursor;
    expect(cursor).not.toBeNull();
    expect(cursor?.line).toBeGreaterThan(0);
    expect(cursor?.col).toBeGreaterThan(0);
  });

  it('updates cursor when switching to a shorter document (e.g. a tab switch)', async () => {
    act(() => {
      root.render(<SourceEditor />);
    });

    const view = useViewStore.getState().editorView!;
    // The normal selection-change path updates the cursor on the next animation frame.
    await act(async () => {
      view.dispatch({ selection: { anchor: view.state.doc.line(3).from } });
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });
    expect(useViewStore.getState().cursor?.line).toBe(3);

    // A load change (as tab switching produces) replaces the editor state via
    // EditorView.setState(), which - unlike dispatch() - doesn't fire the update
    // listener. The view store's cursor must still end up matching the new, shorter
    // document rather than keeping the outgoing tab's line number.
    act(() => {
      useDocumentStore.setState({
        ...EMPTY_DOC,
        hasDocument: true,
        content: 'only line',
        loadId: 2,
      });
    });

    const cursor = useViewStore.getState().cursor;
    expect(cursor?.line).toBe(1);
    expect(cursor?.col).toBe(1);
  });
});

describe('needsExternalSync', () => {
  it('returns false without calling readDoc when content matches lastEmitted', () => {
    const readDoc = vi.fn(() => 'different');
    const result = needsExternalSync('hello', 'hello', readDoc);
    expect(result).toBe(false);
    expect(readDoc).not.toHaveBeenCalled();
  });

  it('calls readDoc and returns false when doc matches content but lastEmitted differs', () => {
    const readDoc = vi.fn(() => 'hello');
    const result = needsExternalSync('hello', 'old', readDoc);
    expect(result).toBe(false);
    expect(readDoc).toHaveBeenCalledOnce();
  });

  it('calls readDoc and returns true when doc differs from content', () => {
    const readDoc = vi.fn(() => 'old');
    const result = needsExternalSync('hello', null, readDoc);
    expect(result).toBe(true);
    expect(readDoc).toHaveBeenCalledOnce();
  });

  it('detects real external changes', () => {
    const readDoc = vi.fn(() => 'external change');
    const result = needsExternalSync('current', null, readDoc);
    expect(result).toBe(true);
  });
});
