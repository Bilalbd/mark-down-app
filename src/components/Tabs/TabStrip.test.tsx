import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EMPTY_DOC, useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
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

describe('TabStrip "Open recent" flyout hover aim', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  const tabsBefore = useTabsStore.getState();
  const docBefore = useDocumentStore.getState();
  const recentBefore = useSettingsStore.getState().recentFiles;
  const FLYOUT_BOX = { left: 200, right: 440, top: 80, bottom: 280 };

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no layout: give the flyout a box to the right of the "Open recent" item.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const box = this.classList.contains('tabstrip__flyout')
        ? FLYOUT_BOX
        : { left: 0, right: 0, top: 0, bottom: 0 };
      return { ...box, x: box.left, y: box.top, width: 0, height: 0, toJSON: () => box };
    });
    useSettingsStore.setState({ recentFiles: ['/docs/one.md', '/docs/two.md'] });
    useDocumentStore.setState({ ...EMPTY_DOC, path: '/docs/active.md', hasDocument: true });
    useTabsStore.setState({ tabs: [{ id: 'a', snapshot: null }], activeId: 'a' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<TabStrip />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    useTabsStore.setState({ tabs: tabsBefore.tabs, activeId: tabsBefore.activeId });
    useDocumentStore.setState({ path: docBefore.path, hasDocument: docBefore.hasDocument });
    useSettingsStore.setState({ recentFiles: recentBefore });
  });

  const flyoutOpen = () => container.querySelector('.tabstrip__flyout') !== null;

  function move(x: number, y: number) {
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }),
      );
    });
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  /** Opens the menu and hovers "Open recent", then moves a few pixels inside it. */
  function hoverRecent() {
    const plus = container.querySelector<HTMLButtonElement>('.tabstrip__new')!;
    act(() => plus.click());
    const recent = container.querySelector<HTMLElement>('[data-menu-item="recent"]')!;
    act(() => {
      recent.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true, clientX: 98, clientY: 98 }),
      );
    });
    move(100, 100);
    move(110, 104);
    move(120, 108);
    expect(flyoutOpen()).toBe(true);
    return recent;
  }

  /** React derives `mouseleave` from `mouseout` on the element being left. */
  function leave(from: HTMLElement, x: number, y: number) {
    act(() => {
      from.dispatchEvent(
        new MouseEvent('mouseout', {
          bubbles: true,
          clientX: x,
          clientY: y,
          relatedTarget: document.body,
        }),
      );
    });
  }

  it('keeps the flyout open while the pointer leaves "Open recent" heading for it', () => {
    const recent = hoverRecent();
    leave(recent, 125, 112);
    move(130, 116);
    advance(200);
    expect(flyoutOpen()).toBe(true);
  });

  it('closes the flyout after the pointer rests outside for 300 ms', () => {
    const recent = hoverRecent();
    leave(recent, 125, 112);
    move(130, 116);
    advance(299);
    expect(flyoutOpen()).toBe(true);
    advance(2);
    expect(flyoutOpen()).toBe(false);
  });

  it('closes the flyout once a move leaves the triangle towards it', () => {
    const recent = hoverRecent();
    leave(recent, 125, 112);
    move(130, 116);
    move(120, 20); // veers away, straight up
    advance(151);
    expect(flyoutOpen()).toBe(false);
  });

  it('closes the flyout 150 ms after leaving "Open recent" away from it', () => {
    const recent = hoverRecent();
    leave(recent, 118, 60);
    advance(149);
    expect(flyoutOpen()).toBe(true);
    advance(2);
    expect(flyoutOpen()).toBe(false);
  });
});
