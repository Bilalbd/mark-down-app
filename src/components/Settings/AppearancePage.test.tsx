import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('./PresetsTab', () => ({ PresetsTab: () => <div data-view="presets" /> }));
vi.mock('./AppearanceTab', () => ({ AppearanceTab: () => <div data-view="fonts" /> }));
vi.mock('./CustomCssTab', () => ({ CustomCssTab: () => <div data-view="css" /> }));

import { AppearancePage, type AppearanceView } from './AppearancePage';

function Harness() {
  const [view, setView] = useState<AppearanceView>('presets');
  return <AppearancePage view={view} onViewChange={setView} />;
}

describe('AppearancePage', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  const segments = () =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('.settings__seg'));
  const shown = () => container.querySelector('[data-view]')?.getAttribute('data-view');

  it('offers Presets, Fonts & colours and Custom CSS, starting on Presets', () => {
    expect(segments().map((b) => b.textContent)).toEqual([
      'Presets',
      'Fonts & colours',
      'Custom CSS',
    ]);
    expect(shown()).toBe('presets');
    expect(segments().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
  });

  it('switches between the three views with the segmented control', () => {
    act(() => segments()[1].click());
    expect(shown()).toBe('fonts');
    expect(segments()[1].getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('[data-view]')).toHaveLength(1);

    act(() => segments()[2].click());
    expect(shown()).toBe('css');

    act(() => segments()[0].click());
    expect(shown()).toBe('presets');
  });
});
