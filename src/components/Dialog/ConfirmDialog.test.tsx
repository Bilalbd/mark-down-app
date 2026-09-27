import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDialogStore } from './ConfirmDialog';
import { ConfirmDialog } from './ConfirmDialog';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
});

describe('ConfirmDialog', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<ConfirmDialog />);
    });
    useDialogStore.setState({ current: null });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    useDialogStore.setState({ current: null });
  });

  it('Tab from the last button goes to the first', () => {
    // Open dialog with three buttons
    act(() => {
      useDialogStore.getState().show('Test', 'Message', [
        { id: 'cancel', label: 'Cancel' },
        { id: 'ok', label: 'OK', primary: true },
        { id: 'delete', label: 'Delete' },
      ]);
    });

    const buttons = Array.from(container.querySelectorAll('button.dialog__btn'));
    expect(buttons.length).toBe(3);

    // Focus is initially on the primary (OK) button
    expect(document.activeElement).toBe(buttons[1]);

    // Tab from the last button (Delete) goes to the first (Cancel)
    act(() => {
      buttons[2].focus();
    });
    expect(document.activeElement).toBe(buttons[2]);

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    let prevented = false;
    tabEvent.preventDefault = () => {
      prevented = true;
    };

    act(() => {
      window.dispatchEvent(tabEvent);
    });

    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('Shift+Tab from the first button goes to the last', () => {
    // Open dialog with three buttons
    act(() => {
      useDialogStore.getState().show('Test', 'Message', [
        { id: 'cancel', label: 'Cancel' },
        { id: 'ok', label: 'OK', primary: true },
        { id: 'delete', label: 'Delete' },
      ]);
    });

    const buttons = Array.from(container.querySelectorAll('button.dialog__btn'));

    // Focus the first button
    act(() => {
      buttons[0].focus();
    });
    expect(document.activeElement).toBe(buttons[0]);

    const shiftTabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    let prevented = false;
    shiftTabEvent.preventDefault = () => {
      prevented = true;
    };

    act(() => {
      window.dispatchEvent(shiftTabEvent);
    });

    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('focus is restored when dialog closes', () => {
    const focusButton = document.createElement('button');
    focusButton.textContent = 'Focus Target';
    document.body.appendChild(focusButton);

    act(() => {
      focusButton.focus();
    });

    expect(document.activeElement).toBe(focusButton);

    // Open dialog
    act(() => {
      useDialogStore.getState().show('Test', 'Message', [{ id: 'ok', label: 'OK', primary: true }]);
    });

    // Focus should be on dialog button
    const dialogButton = container.querySelector('button.dialog__btn');
    expect(document.activeElement).toBe(dialogButton);

    // Close dialog
    act(() => {
      useDialogStore.getState().close('ok');
    });

    // Focus should return to the original button
    expect(document.activeElement).toBe(focusButton);

    focusButton.remove();
  });

  it('wraps Tab correctly in a dialog with fewer buttons than the one before', () => {
    act(() => {
      useDialogStore.getState().show('First', 'Three buttons', [
        { id: 'a', label: 'A', primary: true },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ]);
    });
    act(() => {
      useDialogStore.getState().close(null);
    });
    act(() => {
      useDialogStore.getState().show('Second', 'Two buttons', [
        { id: 'save', label: 'Save anyway', primary: true },
        { id: 'cancel', label: 'Cancel' },
      ]);
    });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button.dialog__btn'));
    expect(buttons.length).toBe(2);
    act(() => {
      buttons[1].focus();
    });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      );
    });

    expect(document.activeElement).toBe(buttons[0]);
  });
});
