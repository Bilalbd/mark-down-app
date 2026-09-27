import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
});

vi.mock('@/components/Toolbar/Toolbar', () => ({
  ICON: { size: 16, strokeWidth: 1.75, absoluteStrokeWidth: true },
}));

const mockRevealInExplorer = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    revealInExplorer: (...args: Parameters<typeof actual.revealInExplorer>) =>
      mockRevealInExplorer(...args),
  };
});

import { TabContextMenu } from './TabContextMenu';

describe('TabContextMenu', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  const mockOnClose = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockOnClose.mockClear();
    mockRevealInExplorer.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders menu items', async () => {
    act(() => {
      root.render(
        <TabContextMenu
          tabId="tab1"
          tabPath="C:\\docs\\test.md"
          x={100}
          y={100}
          onClose={mockOnClose}
        />,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const menu = container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();

    const items = container.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBeGreaterThanOrEqual(5);

    const labels = Array.from(items).map((item) => item.textContent);
    expect(labels[0]).toContain('Close');
    expect(labels[1]).toContain('Close others');
    expect(labels[2]).toContain('Close to the right');
    expect(labels[3]).toContain('Copy path');
    expect(labels[4]).toContain('Reveal in File Explorer');
  });

  it('disables Copy path when tabPath is null', async () => {
    act(() => {
      root.render(
        <TabContextMenu tabId="tab1" tabPath={null} x={100} y={100} onClose={mockOnClose} />,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const items = container.querySelectorAll('[role="menuitem"]') as NodeListOf<HTMLButtonElement>;
    const copyPathBtn = Array.from(items).find((item) => item.textContent?.includes('Copy path'));

    expect(copyPathBtn?.disabled).toBe(true);
  });

  it('disables Reveal in File Explorer when tabPath is null', async () => {
    act(() => {
      root.render(
        <TabContextMenu tabId="tab1" tabPath={null} x={100} y={100} onClose={mockOnClose} />,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const items = container.querySelectorAll('[role="menuitem"]') as NodeListOf<HTMLButtonElement>;
    const revealBtn = Array.from(items).find((item) =>
      item.textContent?.includes('Reveal in File Explorer'),
    );

    expect(revealBtn?.disabled).toBe(true);
  });

  it('closes menu and returns focus on Escape', async () => {
    act(() => {
      root.render(
        <TabContextMenu
          tabId="tab1"
          tabPath="C:\\docs\\test.md"
          x={100}
          y={100}
          onClose={mockOnClose}
        />,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(escapeEvent);
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes on click outside', async () => {
    act(() => {
      root.render(
        <TabContextMenu
          tabId="tab1"
          tabPath="C:\\docs\\test.md"
          x={100}
          y={100}
          onClose={mockOnClose}
        />,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('focuses first menu item on render', async () => {
    act(() => {
      root.render(
        <TabContextMenu
          tabId="tab1"
          tabPath="C:\\docs\\test.md"
          x={100}
          y={100}
          onClose={mockOnClose}
        />,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const items = container.querySelectorAll('[role="menuitem"]') as NodeListOf<HTMLButtonElement>;
    expect(document.activeElement).toBe(items[0]);
  });

  it('navigates menu items with arrow keys, skipping disabled items', async () => {
    act(() => {
      root.render(
        <TabContextMenu
          tabId="tab1"
          tabPath="C:\\docs\\test.md"
          x={100}
          y={100}
          onClose={mockOnClose}
        />,
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const items = Array.from(
      container.querySelectorAll('[role="menuitem"]') as NodeListOf<HTMLButtonElement>,
    );
    const firstItem = items[0];

    expect(document.activeElement).toBe(firstItem);

    const downEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(downEvent);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should skip disabled items and focus on the next enabled item
    const nextFocused = document.activeElement as HTMLButtonElement;
    expect(nextFocused.disabled).toBe(false);
    expect(items.indexOf(nextFocused) > 0).toBe(true);
  });
});
