import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// SplitView imports the editor and preview, which pull in the theme hook; jsdom has no matchMedia.
vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

import { useCursorMirror } from './SplitView';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Harness() {
  useCursorMirror();
  return null;
}

describe('useCursorMirror', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  let scroll: HTMLElement;

  const marked = () => Array.from(scroll.querySelectorAll('.is-cursor-block')).map((el) => el.id);

  const setCursor = (line: number) =>
    act(() => {
      useViewStore.setState({ cursor: { line, col: 1 } });
    });

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    scroll = document.createElement('div');
    scroll.innerHTML = `<div class="preview">
      <p id="a" data-line="0" data-line-end="1">A</p>
      <ul id="list" data-line="2" data-line-end="4">
        <li id="item1" data-line="2" data-line-end="3">one</li>
        <li id="item2" data-line="3" data-line-end="4">two</li>
      </ul>
      <table id="t" data-line="5" data-line-end="7"><tbody>
        <tr id="row" data-line="5" data-line-end="6"><td>x</td></tr>
        <tr id="row2" data-line="6" data-line-end="7"><td>y</td></tr>
      </tbody></table>
    </div>`;
    document.body.appendChild(scroll);

    useSettingsStore.setState({ splitCursorMirror: false });
    useViewStore.setState({ previewScrollEl: scroll, previewVersion: 1, cursor: null });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    scroll.remove();
    vi.unstubAllGlobals();
    useSettingsStore.setState({ splitCursorMirror: false });
    useViewStore.setState({ previewScrollEl: null, cursor: null });
  });

  it('is off by default', () => {
    expect(useSettingsStore.getState().splitCursorMirror).toBe(false);
  });

  it('marks nothing, and reads no blocks, while the setting is off', () => {
    const query = vi.spyOn(scroll, 'querySelector');
    act(() => root.render(<Harness />));
    setCursor(1);
    setCursor(3);
    expect(marked()).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('marks the innermost block holding the cursor while the setting is on', () => {
    useSettingsStore.setState({ splitCursorMirror: true });
    act(() => root.render(<Harness />));
    setCursor(1);
    expect(marked()).toEqual(['a']);
    setCursor(4);
    expect(marked()).toEqual(['item2']);
    setCursor(2);
    expect(marked()).toEqual([]);
  });

  it('shows and clears the tint as the setting is turned on and off', () => {
    act(() => root.render(<Harness />));
    setCursor(1);
    expect(marked()).toEqual([]);

    act(() => {
      useSettingsStore.setState({ splitCursorMirror: true });
    });
    expect(marked()).toEqual(['a']);

    act(() => {
      useSettingsStore.setState({ splitCursorMirror: false });
    });
    expect(marked()).toEqual([]);
    setCursor(3);
    expect(marked()).toEqual([]);
  });

  it('lets the table of a marked row paint outside itself, and lets go when the cursor leaves', () => {
    useSettingsStore.setState({ splitCursorMirror: true });
    act(() => root.render(<Harness />));
    setCursor(6);
    expect(marked()).toEqual(['row']);
    expect(scroll.querySelector('#t')?.classList.contains('is-cursor-table')).toBe(true);
    setCursor(1);
    expect(marked()).toEqual(['a']);
    expect(scroll.querySelector('.is-cursor-table')).toBeNull();
  });
});
