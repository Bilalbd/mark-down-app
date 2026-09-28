import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/lib/tauri', () => ({
  getAppVersion: vi.fn().mockResolvedValue('0.8.0'),
}));

import { GeneralTab } from './GeneralTab';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('GeneralTab version line', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('shows the app version once it loads', async () => {
    await act(async () => {
      root.render(<GeneralTab />);
      await Promise.resolve();
    });

    expect(container.querySelector('.settings__version')?.textContent).toBe('Version 0.8.0');
  });
});
