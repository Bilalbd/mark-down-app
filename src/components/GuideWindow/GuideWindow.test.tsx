import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

const mockClose = vi.fn<() => Promise<void>>();
const mockEmitGuideReady = vi.fn();
const mockOpenExternal = vi.fn<(url: string) => Promise<void>>();
const mockRenderMermaid = vi.fn<() => Promise<void>>();
const mockScrollIntoView = vi.fn(); // jsdom has none; the outline and anchors call it

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: () => mockClose(),
    isMaximized: () => Promise.resolve(false),
    onResized: () => Promise.resolve(() => undefined),
    onFocusChanged: () => Promise.resolve(() => undefined),
    minimize: () => Promise.resolve(),
    toggleMaximize: () => Promise.resolve(),
  }),
}));
vi.mock('@tauri-apps/plugin-store', () => ({ load: () => Promise.reject(new Error('no store')) }));
vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    emitGuideReady: () => mockEmitGuideReady(),
    openExternal: (url: string) => mockOpenExternal(url),
  };
});
vi.mock('@/markdown/mermaid', () => ({ renderMermaidBlocks: () => mockRenderMermaid() }));

import { GuideWindow } from './GuideWindow';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('GuideWindow', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    mockClose.mockReset().mockResolvedValue(undefined);
    mockEmitGuideReady.mockReset();
    mockOpenExternal.mockReset().mockResolvedValue(undefined);
    mockRenderMermaid.mockReset().mockResolvedValue(undefined);
    mockScrollIntoView.mockReset();
    Element.prototype.scrollIntoView = mockScrollIntoView;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<GuideWindow />);
    });
    // The guide is imported and rendered asynchronously.
    await vi.waitFor(() => expect(container.querySelector('.preview h2')).not.toBeNull(), {
      timeout: 15000,
    });
  }, 20000);

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  const press = (init: KeyboardEventInit) =>
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
      );
    });

  it("lists the guide's headings in the outline", () => {
    const items = Array.from(container.querySelectorAll('.outline__text')).map(
      (el) => el.textContent,
    );
    expect(items).toEqual(
      expect.arrayContaining(['Guide', 'Welcome', 'The guide window', 'Keyboard shortcuts']),
    );
  });

  it('shows the title bar, the outline and the formatted guide, and nothing that edits', () => {
    expect(container.querySelector('.titlebar')).not.toBeNull();
    expect(container.querySelector('.titlebar')?.textContent).toContain('Guide');
    expect(container.querySelector('.outline')).not.toBeNull();
    expect(container.querySelector('.preview h1')?.textContent).toBe('Guide');

    for (const selector of [
      '.source-editor',
      '.cm-editor',
      '.toolbar',
      '.tabstrip',
      '.statusbar',
    ]) {
      expect(container.querySelector(selector), selector).toBeNull();
    }
    expect(container.querySelector('.findbar')).toBeNull();
    expect(container.querySelector('textarea, [contenteditable="true"]')).toBeNull();
  });

  it('reveals the window once the guide has rendered', async () => {
    await vi.waitFor(() => expect(mockEmitGuideReady).toHaveBeenCalled());
    expect(mockRenderMermaid).toHaveBeenCalled(); // the guide has a Mermaid diagram
  });

  it('closes on Escape and Ctrl+W, and ignores F1', () => {
    press({ key: 'F1' });
    expect(mockClose).not.toHaveBeenCalled();

    press({ key: 'Escape' });
    expect(mockClose).toHaveBeenCalledTimes(1);

    press({ key: 'w', ctrlKey: true });
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it('has no right-click menu', () => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    container.querySelector('.preview')?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  const click = (href: string): MouseEvent => {
    const link = document.createElement('a');
    link.setAttribute('href', href);
    link.textContent = 'test link';
    container.querySelector('.preview')?.appendChild(link);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(event);
    });
    return event;
  };

  it('opens http(s) and mailto links outside the app', () => {
    expect(click('https://example.com/page').defaultPrevented).toBe(true);
    expect(mockOpenExternal).toHaveBeenLastCalledWith('https://example.com/page');

    expect(click('mailto:someone@example.com').defaultPrevented).toBe(true);
    expect(mockOpenExternal).toHaveBeenLastCalledWith('mailto:someone@example.com');
  });

  it('scrolls to #anchors without opening anything', () => {
    mockScrollIntoView.mockClear();

    expect(click('#welcome').defaultPrevented).toBe(true);

    expect(mockScrollIntoView).toHaveBeenCalled();
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });

  it('does nothing for any other link, and never lets the window navigate', () => {
    for (const href of ['Other.md', 'file:///C:/Windows/win.ini', 'javascript:alert(1)', '//x.y']) {
      expect(click(href).defaultPrevented, href).toBe(true);
    }
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });
});
