import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { GeneralPage } from './GeneralPage';
import { useSettingsStore } from '@/store/settings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('GeneralPage', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  const render = () => act(() => root.render(<GeneralPage />));

  const cards = () =>
    Array.from(container.querySelectorAll('.settings__section')).map((c) => ({
      title: c.querySelector('.settings__section-title')?.textContent,
      rows: Array.from(c.querySelectorAll('.settings__label')).map(
        (l) => l.childNodes[0]?.textContent,
      ),
    }));

  it('has the Window, Layout and Documents cards with their settings in order', () => {
    render();
    expect(cards()).toEqual([
      { title: 'Window', rows: ['Theme', 'Open files in'] },
      {
        title: 'Layout',
        rows: [
          'Show outline',
          'Show status bar',
          'Split layout',
          "Highlight the cursor's block in Split view",
          'Preview zoom',
        ],
      },
      { title: 'Documents', rows: ['Block remote images', 'Self-contained HTML export'] },
    ]);
  });

  it('gives every setting a hint', () => {
    render();
    const rows = Array.from(container.querySelectorAll('.settings__row'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.querySelector('.settings__hint'))).toBe(true);
  });

  it('has a Split cursor highlight toggle, off by default, that turns the setting on', () => {
    useSettingsStore.setState({ splitCursorMirror: false });
    render();
    const row = Array.from(container.querySelectorAll('.settings__row')).find((r) =>
      r.textContent?.includes("Highlight the cursor's block in Split view"),
    );
    expect(row?.textContent).toContain("Tints the formatted block you're editing");
    const box = row!.querySelector<HTMLElement>('[role="switch"], input[type="checkbox"]')!;
    expect(box).toBeTruthy();
    act(() => box.click());
    expect(useSettingsStore.getState().splitCursorMirror).toBe(true);
    useSettingsStore.setState({ splitCursorMirror: false });
  });

  it('flips the Show outline setting from its new place', () => {
    useSettingsStore.setState({ outlineVisible: true });
    render();
    const row = Array.from(container.querySelectorAll('.settings__row')).find((r) =>
      r.textContent?.includes('Show outline'),
    );
    act(() => row!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(useSettingsStore.getState().outlineVisible).toBe(false);
    useSettingsStore.setState({ outlineVisible: true });
  });
});
