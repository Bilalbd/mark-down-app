import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useSettingsStore } from '@/store/settings';

vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

vi.mock('@/lib/tauri');
vi.mock('@tauri-apps/api/event');

const mockOpenGuide = vi.fn();
vi.mock('@/store/tabs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/tabs')>();
  return { ...actual, openGuide: () => mockOpenGuide() };
});

import { Toolbar } from './Toolbar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Toolbar view mode switcher', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  const settingsBefore = useSettingsStore.getState();

  beforeEach(() => {
    useSettingsStore.setState({
      viewMode: 'formatted',
      set: vi.fn((key: string, value: unknown) => {
        useSettingsStore.setState({ [key]: value } as Record<string, unknown>);
      }),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    useSettingsStore.setState({
      viewMode: settingsBefore.viewMode,
      set: settingsBefore.set,
    });
  });

  it('renders three view mode buttons with correct aria-labels', () => {
    act(() => {
      root.render(<Toolbar />);
    });

    const buttons = container.querySelectorAll('.toolbar__seg');
    expect(buttons).toHaveLength(3);

    const labels = Array.from(buttons).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Formatted view', 'Source view', 'Split view']);
  });

  it('marks the formatted button as active when viewMode is formatted', () => {
    useSettingsStore.setState({ viewMode: 'formatted' });

    act(() => {
      root.render(<Toolbar />);
    });

    const buttons = container.querySelectorAll('.toolbar__seg');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the source button as active when viewMode is source', () => {
    useSettingsStore.setState({ viewMode: 'source' });

    act(() => {
      root.render(<Toolbar />);
    });

    const buttons = container.querySelectorAll('.toolbar__seg');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the split button as active when viewMode is split', () => {
    useSettingsStore.setState({ viewMode: 'split' });

    act(() => {
      root.render(<Toolbar />);
    });

    const buttons = container.querySelectorAll('.toolbar__seg');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the source button changes viewMode to source', () => {
    useSettingsStore.setState({ viewMode: 'formatted' });

    act(() => {
      root.render(<Toolbar />);
    });

    const buttons = container.querySelectorAll('.toolbar__seg');
    const sourceBtn = buttons[1] as HTMLButtonElement;

    act(() => {
      sourceBtn.click();
    });

    expect(useSettingsStore.getState().viewMode).toBe('source');
  });

  it('clicking the split button changes viewMode to split', () => {
    useSettingsStore.setState({ viewMode: 'formatted' });

    act(() => {
      root.render(<Toolbar />);
    });

    const buttons = container.querySelectorAll('.toolbar__seg');
    const splitBtn = buttons[2] as HTMLButtonElement;

    act(() => {
      splitBtn.click();
    });

    expect(useSettingsStore.getState().viewMode).toBe('split');
  });

  it('applies is-active class to the active button', () => {
    useSettingsStore.setState({ viewMode: 'source' });

    act(() => {
      root.render(<Toolbar />);
    });

    const buttons = container.querySelectorAll('.toolbar__seg');
    expect((buttons[0] as HTMLElement).classList.contains('is-active')).toBe(false);
    expect((buttons[1] as HTMLElement).classList.contains('is-active')).toBe(true);
    expect((buttons[2] as HTMLElement).classList.contains('is-active')).toBe(false);
  });

  it('renders a Guide button that opens the guide on click', () => {
    act(() => {
      root.render(<Toolbar />);
    });

    const btn = container.querySelector<HTMLButtonElement>('[aria-label="Guide"]');
    expect(btn).not.toBeNull();
    expect(btn?.title).toBe('Guide (F1)');

    act(() => {
      btn!.click();
    });
    expect(mockOpenGuide).toHaveBeenCalled();
  });
});
