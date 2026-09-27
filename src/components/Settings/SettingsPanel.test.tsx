import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { ConfirmDialog } from '@/components/Dialog/ConfirmDialog';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
});

vi.mock('./AppearanceTab', () => ({
  AppearanceTab: () => null,
}));
vi.mock('./PresetsTab', () => ({
  PresetsTab: () => null,
}));
vi.mock('./CustomCssTab', () => ({
  CustomCssTab: () => null,
}));
vi.mock('./GeneralTab', () => ({
  GeneralTab: () => null,
}));

import { SettingsPanel } from './SettingsPanel';

describe('SettingsPanel', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <>
          <SettingsPanel />
          <ConfirmDialog />
        </>,
      );
    });
    useSettingsStore.setState({ loaded: true });
    useViewStore.setState({ settingsOpen: false });
    useDialogStore.setState({ current: null });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    useSettingsStore.setState({ loaded: false });
    useViewStore.setState({ settingsOpen: false });
    useDialogStore.setState({ current: null });
  });

  it('closes Settings and Dialog separately with two Escapes', async () => {
    // Open Settings
    act(() => {
      useViewStore.setState({ settingsOpen: true });
    });

    expect(useViewStore.getState().settingsOpen).toBe(true);

    // Start a dialog
    const dialogPromise = useDialogStore
      .getState()
      .show('Test', 'Message', [{ id: 'ok', label: 'OK' }]);

    // Wait for dialog to be set
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(useDialogStore.getState().current).not.toBeNull();
    const initialSettingsOpen = useViewStore.getState().settingsOpen;

    // Press Escape: SettingsPanel listener runs first (registered first), but returns early
    // because dialog is open; ConfirmDialog listener then runs and closes the dialog.
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(escapeEvent);
    });

    // Wait for async updates
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(useDialogStore.getState().current).toBeNull();
    expect(useViewStore.getState().settingsOpen).toBe(initialSettingsOpen);

    // Get the result from the dialog promise
    const dialogResult = await Promise.race([
      dialogPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
    expect(dialogResult).toBeNull();

    // Second Escape closes Settings
    const escapeEvent2 = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      window.dispatchEvent(escapeEvent2);
    });

    // Wait for async updates
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(useViewStore.getState().settingsOpen).toBe(false);
  });
});
