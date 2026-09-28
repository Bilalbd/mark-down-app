import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ContextMenu, findMenuItem, type MenuEntry } from './ContextMenu';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function items(): MenuEntry[] {
  return [
    { id: 'one', label: 'One' },
    { id: 'two', label: 'Two', disabled: true },
    { id: 'sep', separator: true },
    {
      id: 'more',
      label: 'More',
      submenu: [
        { id: 'more-a', label: 'More A' },
        { id: 'more-b', label: 'More B' },
      ],
    },
    { id: 'three', label: 'Three' },
  ];
}

describe('findMenuItem', () => {
  it('finds a top-level item', () => {
    expect(findMenuItem(items(), 'one')?.label).toBe('One');
  });

  it('finds an item inside a submenu', () => {
    expect(findMenuItem(items(), 'more-b')?.label).toBe('More B');
  });

  it('returns undefined for an unknown id, skipping separators', () => {
    expect(findMenuItem(items(), 'sep')).toBeUndefined();
    expect(findMenuItem(items(), 'nope')).toBeUndefined();
  });
});

describe('ContextMenu', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  const onAction = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onAction.mockClear();
    onClose.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(entries: MenuEntry[] = items()) {
    act(() => {
      root.render(
        <ContextMenu x={10} y={10} items={entries} onAction={onAction} onClose={onClose} />,
      );
    });
  }

  it('renders items, separators and disabled state', () => {
    render();
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const menuItems = document.body.querySelectorAll('[role="menuitem"]');
    expect(menuItems.length).toBe(4); // one, two, more, three (separator isn't a menuitem)
    const two = Array.from(menuItems).find((el) => el.textContent?.includes('Two'));
    expect(two).toHaveProperty('disabled', true);
    expect(document.body.querySelector('[role="separator"]')).not.toBeNull();
  });

  it('focuses the first enabled item on open', () => {
    render();
    expect(document.activeElement?.textContent).toContain('One');
  });

  it('Escape calls onClose', () => {
    render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown skips the disabled item', () => {
    render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    // From "One", skipping disabled "Two", lands on "More".
    expect(document.activeElement?.textContent).toContain('More');
  });

  it('Enter activates a plain item and closes the menu', () => {
    render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onAction).toHaveBeenCalledWith('one');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowRight opens the submenu and focuses its first item, Left closes it', async () => {
    render();
    // Move focus onto "More".
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement?.textContent).toContain('More');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.activeElement?.textContent).toContain('More A');
    expect(onAction).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(document.activeElement?.textContent).toContain('More');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('outside mousedown closes the menu', () => {
    render();
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clamps a negative position to stay inside the viewport', () => {
    act(() => {
      root.render(
        <ContextMenu x={-50} y={-30} items={items()} onAction={onAction} onClose={onClose} />,
      );
    });
    const menu = document.body.querySelector('.context-menu') as HTMLElement;
    expect(menu.style.left).toBe('0px');
    expect(menu.style.top).toBe('0px');
  });
});
