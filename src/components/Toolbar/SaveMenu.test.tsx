import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDocumentStore } from '@/store/document';

vi.mock('./Toolbar', () => ({
  ICON: { size: 16, strokeWidth: 1.75, absoluteStrokeWidth: true },
}));

import { SaveMenu } from './SaveMenu';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
});

describe('SaveMenu', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useDocumentStore.setState({
      save: vi.fn(),
      saveAs: vi.fn(),
      hasDocument: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    useDocumentStore.setState({
      save: vi.fn(),
      saveAs: vi.fn(),
      hasDocument: false,
    });
  });

  it('clicking the disk button calls save once and does not open the menu', async () => {
    act(() => {
      root.render(<SaveMenu />);
    });

    const saveBtn = container.querySelector('button[aria-label="Save"]');
    expect(saveBtn).not.toBeNull();

    const saveSpy = useDocumentStore.getState().save as ReturnType<typeof vi.fn>;
    expect(saveSpy).not.toHaveBeenCalled();

    const menu = container.querySelector('[role="menu"]');
    expect(menu).toBeNull();

    act(() => {
      saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(saveSpy).toHaveBeenCalledOnce();
    const menuAfterClick = container.querySelector('[role="menu"]');
    expect(menuAfterClick).toBeNull();
  });

  it('clicking the caret button opens the menu', async () => {
    act(() => {
      root.render(<SaveMenu />);
    });

    const caretBtn = container.querySelector('button[aria-label="More save options"]');
    expect(caretBtn).not.toBeNull();
    expect(caretBtn?.getAttribute('aria-haspopup')).toBe('menu');
    expect(caretBtn?.getAttribute('aria-expanded')).toBe('false');

    let menu = container.querySelector('[role="menu"]');
    expect(menu).toBeNull();

    act(() => {
      caretBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    menu = container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(caretBtn?.getAttribute('aria-expanded')).toBe('true');
  });

  it('clicking "Save as…" calls saveAs and closes the menu', async () => {
    act(() => {
      root.render(<SaveMenu />);
    });

    const caretBtn = container.querySelector('button[aria-label="More save options"]');
    const saveAsSpy = useDocumentStore.getState().saveAs as ReturnType<typeof vi.fn>;

    expect(saveAsSpy).not.toHaveBeenCalled();

    act(() => {
      caretBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const menuItems = container.querySelectorAll('[role="menuitem"]');
    const saveAsBtn = menuItems[1];

    expect(saveAsBtn?.textContent).toContain('Save as…');

    act(() => {
      saveAsBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(saveAsSpy).toHaveBeenCalledOnce();
    const menu = container.querySelector('[role="menu"]');
    expect(menu).toBeNull();
  });

  it('disables both buttons when hasDocument is false', async () => {
    useDocumentStore.setState({ hasDocument: false });

    act(() => {
      root.render(<SaveMenu />);
    });

    const saveBtn = container.querySelector('button[aria-label="Save"]') as HTMLButtonElement;
    const caretBtn = container.querySelector(
      'button[aria-label="More save options"]',
    ) as HTMLButtonElement;

    expect(saveBtn?.disabled).toBe(true);
    expect(caretBtn?.disabled).toBe(true);
  });
});
