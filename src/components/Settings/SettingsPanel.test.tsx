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

vi.mock('./GeneralPage', () => ({
  GeneralPage: () => <div data-page="general" />,
}));
vi.mock('./EditorPage', () => ({
  EditorPage: () => <div data-page="editor" />,
}));
vi.mock('./AppearancePage', () => ({
  AppearancePage: ({
    view,
    onViewChange,
  }: {
    view: string;
    onViewChange: (v: 'presets' | 'fonts' | 'css') => void;
  }) => (
    <div data-page="appearance" data-view={view}>
      <button id="pick-css" onClick={() => onViewChange('css')} />
    </div>
  ),
}));
vi.mock('./ShortcutsPage', () => ({
  ShortcutsPage: () => <div data-page="shortcuts" />,
}));
vi.mock('./AboutPage', () => ({
  AboutPage: () => <div data-page="about" />,
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

  const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const shownPage = () => container.querySelector('[data-page]')?.getAttribute('data-page');
  const clickTab = (label: string) =>
    act(() => {
      tabs()
        .find((t) => t.textContent === label)!
        .click();
    });

  it('has five tabs, in order, and opens on General', () => {
    act(() => {
      useViewStore.setState({ settingsOpen: true });
    });
    expect(tabs().map((t) => t.textContent)).toEqual([
      'General',
      'Editor',
      'Appearance',
      'Shortcuts',
      'About',
    ]);
    expect(tabs().filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(shownPage()).toBe('general');
  });

  it('switches page when a tab is clicked, and marks it selected', () => {
    act(() => {
      useViewStore.setState({ settingsOpen: true });
    });
    for (const [label, page] of [
      ['Editor', 'editor'],
      ['Appearance', 'appearance'],
      ['Shortcuts', 'shortcuts'],
      ['About', 'about'],
      ['General', 'general'],
    ]) {
      clickTab(label);
      expect(shownPage()).toBe(page);
      const selected = tabs().find((t) => t.getAttribute('aria-selected') === 'true');
      expect(selected?.textContent).toBe(label);
    }
  });

  it('remembers the last page after Settings is closed and opened again', () => {
    act(() => {
      useViewStore.setState({ settingsOpen: true });
    });
    clickTab('Shortcuts');
    act(() => {
      useViewStore.setState({ settingsOpen: false });
    });
    expect(container.querySelector('.settings')).toBeNull();
    act(() => {
      useViewStore.setState({ settingsOpen: true });
    });
    expect(shownPage()).toBe('shortcuts');
  });

  it('remembers the Appearance view while another page is shown', () => {
    act(() => {
      useViewStore.setState({ settingsOpen: true });
    });
    clickTab('Appearance');
    act(() => {
      container.querySelector<HTMLButtonElement>('#pick-css')!.click();
    });
    clickTab('About');
    clickTab('Appearance');
    expect(container.querySelector('[data-page="appearance"]')?.getAttribute('data-view')).toBe(
      'css',
    );
  });
});
