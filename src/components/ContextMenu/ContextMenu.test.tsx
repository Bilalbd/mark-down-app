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

  it('Escape calls onClose with reason "escape"', () => {
    render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('escape');
  });

  it('ArrowDown skips the disabled item', () => {
    render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    // From "One", skipping disabled "Two", lands on "More".
    expect(document.activeElement?.textContent).toContain('More');
  });

  it('Enter activates a plain item and closes the menu with reason "action"', () => {
    render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onAction).toHaveBeenCalledWith('one');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('action');
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

  it('outside mousedown closes the menu with reason "outside"', () => {
    render();
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('outside');
  });

  it('clicking a plain item closes the menu with reason "action"', () => {
    render();
    const button = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('One'),
    ) as HTMLButtonElement;
    act(() => {
      button.click();
    });
    expect(onAction).toHaveBeenCalledWith('one');
    expect(onClose).toHaveBeenCalledWith('action');
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

  describe('submenu hover aim', () => {
    const SUBMENU_BOX = { left: 200, right: 400, top: 100, bottom: 300 };

    beforeEach(() => {
      vi.useFakeTimers();
      // jsdom has no layout: give the submenu a box to the right of the trigger item.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        const box = this.classList.contains('context-menu--submenu')
          ? SUBMENU_BOX
          : { left: 0, right: 0, top: 0, bottom: 0 };
        return { ...box, x: box.left, y: box.top, width: 0, height: 0, toJSON: () => box };
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    const item = (label: string) =>
      Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
        (el) => el.textContent === label,
      ) as HTMLElement;

    const submenuOpen = () => document.body.querySelector('.context-menu--submenu') !== null;

    function move(target: HTMLElement, x: number, y: number) {
      act(() => {
        target.dispatchEvent(
          new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }),
        );
      });
    }

    /** React derives `mouseenter` from `mouseout` on the element being left when the pointer
     * moves between elements, and from `mouseover` when it comes from outside the page. */
    function enter(target: HTMLElement, from: HTMLElement | null, x: number, y: number) {
      const init = { bubbles: true, clientX: x, clientY: y };
      act(() => {
        if (from)
          from.dispatchEvent(new MouseEvent('mouseout', { ...init, relatedTarget: target }));
        else target.dispatchEvent(new MouseEvent('mouseover', init));
      });
    }

    function advance(ms: number) {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    }

    /** Hovers "More" (which opens its submenu) and moves a few pixels inside it. */
    function hoverMore() {
      render();
      const more = item('More');
      enter(more, null, 148, 112);
      move(more, 150, 114);
      move(more, 160, 120);
      move(more, 170, 128);
      expect(submenuOpen()).toBe(true);
      return more;
    }

    it('keeps the submenu open while the pointer crosses another item on the way to it', () => {
      const more = hoverMore();
      const three = item('Three');
      enter(three, more, 175, 132);
      move(three, 180, 136);
      advance(200);
      expect(submenuOpen()).toBe(true);
    });

    it('closes the submenu after the pointer rests on that item for 300 ms', () => {
      const more = hoverMore();
      const three = item('Three');
      enter(three, more, 175, 132);
      move(three, 180, 136);
      advance(299);
      expect(submenuOpen()).toBe(true);
      advance(2);
      expect(submenuOpen()).toBe(false);
    });

    it('closes the submenu once a move leaves the triangle towards it', () => {
      const more = hoverMore();
      const three = item('Three');
      enter(three, more, 175, 132);
      move(three, 180, 136);
      move(three, 160, 200); // veers away, straight down
      advance(151);
      expect(submenuOpen()).toBe(false);
    });

    it('closes the submenu 150 ms after moving straight down to another item', () => {
      const more = hoverMore();
      const three = item('Three');
      enter(three, more, 150, 140);
      move(three, 150, 141);
      advance(149);
      expect(submenuOpen()).toBe(true);
      advance(2);
      expect(submenuOpen()).toBe(false);
    });

    it('keeps the submenu open once the pointer arrives in it', () => {
      const more = hoverMore();
      const three = item('Three');
      enter(three, more, 175, 132);
      move(three, 180, 136);
      const submenu = document.body.querySelector('.context-menu--submenu') as HTMLElement;
      enter(submenu, three, 205, 140);
      advance(1000);
      expect(submenuOpen()).toBe(true);
    });

    it('keeps the submenu open while the pointer is on one of its items', () => {
      const more = hoverMore();
      const moreA = item('More A');
      enter(moreA, more, 205, 110);
      move(moreA, 210, 112);
      advance(1000);
      expect(submenuOpen()).toBe(true);
    });
  });
});
