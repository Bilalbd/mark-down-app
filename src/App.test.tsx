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

const mockOpenGuideWindow = vi.fn<() => Promise<void>>();

vi.mock('@tauri-apps/plugin-store', () => ({ load: () => Promise.reject(new Error('no store')) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    openGuideWindow: () => mockOpenGuideWindow(),
    getLaunchArgs: () => Promise.resolve(null),
    takePendingOpens: () => Promise.resolve([]),
    emitAppReady: () => undefined,
  };
});

import App from './App';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('App: opening the guide', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    mockOpenGuideWindow.mockReset().mockResolvedValue(undefined);
    Element.prototype.scrollIntoView = () => undefined; // jsdom has none; the tab strip calls it
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('F1 opens the guide window', async () => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });
    expect(mockOpenGuideWindow).toHaveBeenCalledTimes(1);
  });

  it('the toolbar Guide button opens the guide window', async () => {
    const button = container.querySelector<HTMLButtonElement>('[aria-label="Guide"]');
    await act(async () => button?.click());
    expect(mockOpenGuideWindow).toHaveBeenCalledTimes(1);
  });

  it('the start-screen link opens the guide window', async () => {
    const link = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === 'New here? Read the guide',
    );
    expect(link).toBeDefined();
    await act(async () => link?.click());
    expect(mockOpenGuideWindow).toHaveBeenCalledTimes(1);
  });
});
