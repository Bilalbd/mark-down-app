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

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    useSettingsStore.setState({ loaded: true });
    useViewStore.setState({ settingsOpen: false });
    useDialogStore.setState({ current: null });
  });

  afterEach(() => {
    document.body.removeChild(container);
    useSettingsStore.setState({ loaded: false });
    useViewStore.setState({ settingsOpen: false });
    useDialogStore.setState({ current: null });
  });

  it('closes Settings and Dialog separately with two Escapes', async () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <>
          <SettingsPanel />
          <ConfirmDialog />
        </>,
      );
    });

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

    // Simulate Escape key in capture phase - ConfirmDialog handler should run first
    // Create an event that will trigger the capture phase handlers
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    // Get the current listeners - ConfirmDialog listener was registered most recently
    // When the event bubbles in capture phase, it triggers all listeners registered with capture: true
    // The order depends on when they were registered
    act(() => {
      window.dispatchEvent(escapeEvent);
    });

    // Wait for async updates
    await new Promise((resolve) => setTimeout(resolve, 10));

    // With the fix: ConfirmDialog closes (because it's on top and calls stopImmediatePropagation)
    // Settings remains open (because SettingsPanel checks if dialog exists first)
    expect(useDialogStore.getState().current).toBeNull();
    expect(useViewStore.getState().settingsOpen).toBe(initialSettingsOpen);

    // Get the result from the dialog promise
    const dialogResult = await Promise.race([
      dialogPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
    expect(dialogResult).toBeNull();

    // Second Escape should close Settings
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

    root.unmount();
  });
});
