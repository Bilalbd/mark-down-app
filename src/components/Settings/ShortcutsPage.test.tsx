import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ShortcutsPage } from './ShortcutsPage';
import { SHORTCUT_GROUPS } from './shortcutGroups';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ShortcutsPage', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<ShortcutsPage />));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('lists F1 for the guide in the shortcuts table', () => {
    const rows = Array.from(container.querySelectorAll('.settings__shortcuts tr'));
    const guideRow = rows.find((r) => r.textContent?.includes('Guide'));
    expect(guideRow?.querySelector('kbd')?.textContent).toBe('F1');
  });

  it('has one titled card per group, in the README order', () => {
    const titles = Array.from(container.querySelectorAll('.settings__section-title')).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Files', 'Tabs', 'Views', 'Editing (Source view)']);
  });

  it('renders one row for every shortcut in the data', () => {
    const expected = SHORTCUT_GROUPS.reduce((n, g) => n + g.rows.length, 0);
    expect(container.querySelectorAll('.settings__shortcuts tr')).toHaveLength(expected);
    const keys = Array.from(container.querySelectorAll('kbd')).map((k) => k.textContent);
    expect(keys).toContain('Ctrl+Shift+S');
    expect(keys).toContain('Ctrl+\\');
    expect(keys).toContain('Ctrl+B');
  });

  it('gives every shortcut an action and no shortcut twice', () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.rows);
    expect(all.every(([keys, action]) => keys.length > 0 && action.length > 0)).toBe(true);
    expect(new Set(all.map(([keys]) => keys)).size).toBe(all.length);
  });
});
