import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mockGetAppVersion = vi.fn<() => Promise<string | null>>();
const mockSettingsFolder = vi.fn<() => Promise<string | null>>();
const mockReveal = vi.fn<(path: string) => Promise<void>>();
const mockOpenGuide = vi.fn<() => Promise<void>>();

vi.mock('@/lib/tauri', () => ({
  getAppVersion: () => mockGetAppVersion(),
  settingsFolder: () => mockSettingsFolder(),
  revealInExplorer: (path: string) => mockReveal(path),
}));
vi.mock('@/store/tabs', () => ({ openGuide: () => mockOpenGuide() }));

import { AboutPage } from './AboutPage';

describe('AboutPage', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockGetAppVersion.mockReset().mockResolvedValue('1.0.0');
    mockSettingsFolder.mockReset().mockResolvedValue('C:\\Users\\me\\AppData\\Roaming\\app');
    mockReveal.mockReset().mockResolvedValue(undefined);
    mockOpenGuide.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  const render = async () => {
    await act(async () => {
      root.render(<AboutPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const button = (label: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === label,
    );

  it('shows the app version once it loads', async () => {
    mockGetAppVersion.mockResolvedValue('0.8.0');
    await render();
    expect(container.querySelector('.settings__version')?.textContent).toBe('Version 0.8.0');
  });

  it('shows the name, the version and the licence', async () => {
    await render();
    expect(container.querySelector('.settings__about-name')?.textContent).toBe('Markdown');
    expect(container.querySelector('.settings__version')?.textContent).toBe('Version 1.0.0');
    expect(container.textContent).toContain('Released under CC0 1.0');
  });

  it('hides the version line when the version is unknown', async () => {
    mockGetAppVersion.mockResolvedValue(null);
    await render();
    expect(container.querySelector('.settings__version')).toBeNull();
  });

  it('opens the guide from the "Open the guide" button', async () => {
    await render();
    act(() => button('Open the guide')!.click());
    expect(mockOpenGuide).toHaveBeenCalledTimes(1);
  });

  it('shows the settings folder and reveals it in File Explorer', async () => {
    await render();
    expect(container.querySelector('.settings__path')?.textContent).toBe(
      'C:\\Users\\me\\AppData\\Roaming\\app',
    );
    await act(async () => {
      button('Show in File Explorer')!.click();
      await Promise.resolve();
    });
    expect(mockReveal).toHaveBeenCalledWith('C:\\Users\\me\\AppData\\Roaming\\app');
  });

  it('disables the reveal button when the folder is unknown', async () => {
    mockSettingsFolder.mockResolvedValue(null);
    await render();
    expect(button('Show in File Explorer')!.disabled).toBe(true);
  });

  it('shows a message when File Explorer cannot be opened', async () => {
    mockReveal.mockRejectedValue(new Error('denied'));
    await render();
    await act(async () => {
      button('Show in File Explorer')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Could not open the folder');
  });
});
