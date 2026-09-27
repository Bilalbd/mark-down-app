import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EMPTY_DOC, useDocumentStore } from '@/store/document';
import { useTabsStore } from '@/store/tabs';
import { TabStrip } from './TabStrip';

// TabStrip imports the toolbar's shared icon props, which pulls in the theme hook; jsdom has no
// matchMedia (or scrollIntoView, which the strip calls for the active tab), so provide them
// before those modules load.
vi.hoisted(() => {
  Element.prototype.scrollIntoView = () => undefined;
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('TabStrip context menu', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  let writeText: ReturnType<typeof vi.fn>;
  const originalClipboard = navigator.clipboard;
  const tabsBefore = useTabsStore.getState();
  const docBefore = useDocumentStore.getState();

  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    useDocumentStore.setState({ ...EMPTY_DOC, path: '/docs/active.md', hasDocument: true });
    useTabsStore.setState({
      tabs: [
        { id: 'a', snapshot: null },
        {
          id: 'b',
          snapshot: {
            doc: { ...EMPTY_DOC, path: '/notes/other.md', hasDocument: true },
            viewMode: 'formatted',
            topLine: 0,
            needsReload: false,
          },
        },
        {
          id: 'c',
          snapshot: {
            doc: { ...EMPTY_DOC, path: null, hasDocument: true },
            viewMode: 'source',
            topLine: 0,
            needsReload: false,
          },
        },
      ],
      activeId: 'a',
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<TabStrip />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    useTabsStore.setState({ tabs: tabsBefore.tabs, activeId: tabsBefore.activeId });
    useDocumentStore.setState({ path: docBefore.path, hasDocument: docBefore.hasDocument });
  });

  const openMenuOn = (tabId: string) => {
    const tab = container.querySelector(`[data-tab-id="${tabId}"]`)!;
    act(() => {
      tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  };

  it("copies the right-clicked tab's own path, not the active tab's", () => {
    const items = openMenuOn('b');
    const copy = items.find((b) => b.textContent?.includes('Copy path'))!;
    expect(copy.disabled).toBe(false);
    act(() => copy.click());
    expect(writeText).toHaveBeenCalledWith('/notes/other.md');
  });

  it('disables Copy path for an untitled tab', () => {
    const items = openMenuOn('c');
    const copy = items.find((b) => b.textContent?.includes('Copy path'))!;
    expect(copy.disabled).toBe(true);
  });
});
