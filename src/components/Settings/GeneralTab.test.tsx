import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// GeneralTab imports the toolbar's shared icon props (for the personal dictionary's remove
// button), which pulls in the theme hook; jsdom has no matchMedia, so provide it before that
// module loads.
vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

const mockSpellLanguages = vi.fn<() => Promise<string[]>>().mockResolvedValue([]);

vi.mock('@/lib/tauri', () => ({
  getAppVersion: vi.fn().mockResolvedValue('0.8.0'),
  spellLanguages: () => mockSpellLanguages(),
}));

import { GeneralTab } from './GeneralTab';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('GeneralTab', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockSpellLanguages.mockReset();
    mockSpellLanguages.mockResolvedValue([]);
    useSettingsStore.setState({ spellCheck: true, spellLanguages: [], spellWords: [] });
    useViewStore.setState({ spellSupportedLanguages: [] });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  const render = async () => {
    await act(async () => {
      root.render(<GeneralTab />);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('shows the app version once it loads', async () => {
    await render();
    expect(container.querySelector('.settings__version')?.textContent).toBe('Version 0.8.0');
  });

  it('shows a hint when Windows has no spelling dictionaries', async () => {
    await render();
    const note = Array.from(container.querySelectorAll('.settings__note')).map(
      (n) => n.textContent,
    );
    expect(note.some((t) => t?.includes('Windows has no spelling dictionaries installed'))).toBe(
      true,
    );
  });

  it('shows "No words added yet" for an empty personal dictionary', async () => {
    await render();
    const note = Array.from(container.querySelectorAll('.settings__note')).map(
      (n) => n.textContent,
    );
    expect(note.some((t) => t?.includes('No words added yet.'))).toBe(true);
  });

  it('has a Split cursor highlight toggle, off by default, that turns the setting on', async () => {
    useSettingsStore.setState({ splitCursorMirror: false });
    await render();
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

  it('lists one checkbox per language (not per region)', async () => {
    // With 4 regional variants, should show only 2 checkboxes (one per language)
    mockSpellLanguages.mockResolvedValue(['ar-EG', 'ar-SA', 'en-CA', 'en-US']);
    await render();
    const boxes = container.querySelectorAll('.settings__checklist input[type="checkbox"]');
    expect(boxes.length).toBe(2);
  });

  it('ticks the automatic language when spellLanguages is empty', async () => {
    // jsdom's default navigator.language is "en-US".
    mockSpellLanguages.mockResolvedValue(['ar-SA', 'en-US']);
    await render();
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('.settings__checklist input[type="checkbox"]'),
    );
    expect(boxes.filter((b) => b.checked)).toHaveLength(1);
  });

  it('ticks exactly the saved languages once the user has chosen explicitly', async () => {
    mockSpellLanguages.mockResolvedValue(['ar-SA', 'en-US', 'fr-FR']);
    useSettingsStore.setState({ spellLanguages: ['ar', 'fr'] });
    await render();
    const boxes = container.querySelectorAll<HTMLInputElement>(
      '.settings__checklist input[type="checkbox"]',
    );
    expect(Array.from(boxes).filter((b) => b.checked)).toHaveLength(2);
  });

  it('lists ticked languages first, each group then sorted by label', async () => {
    const tags = ['ar-SA', 'en-US', 'fr-FR', 'zh-CN'];
    const tickedCodes = ['fr', 'zh']; // Now using language codes
    mockSpellLanguages.mockResolvedValue(tags);
    useSettingsStore.setState({ spellLanguages: tickedCodes });
    await render();

    // Expected order: ticked language codes first, then the rest - each sorted by label
    const label = (code: string) =>
      new Intl.DisplayNames(['en-US'], { type: 'language' }).of(code)!;
    const byGroupThenLabel = (a: string, b: string) => {
      const groupDiff = Number(tickedCodes.includes(b)) - Number(tickedCodes.includes(a));
      return groupDiff !== 0 ? groupDiff : label(a).localeCompare(label(b));
    };
    const allCodes = ['ar', 'en', 'fr', 'zh'];
    const expectedOrder = [...allCodes].sort(byGroupThenLabel);

    const items = container.querySelectorAll<HTMLLIElement>('.settings__checklist li');
    expect(Array.from(items).map((li) => li.dataset.tag)).toEqual(expectedOrder);
    // Sanity check this isn't a vacuous pass: the ticked ones must lead.
    expect(expectedOrder.slice(0, 2).sort()).toEqual([...tickedCodes].sort());
  });

  it('keeps the checklist order stable when a checkbox is ticked', async () => {
    // Only en ticked to start, so ar (further down, alphabetically after en) is a safe row to tick
    mockSpellLanguages.mockResolvedValue(['ar-SA', 'en-US', 'fr-FR']);
    useSettingsStore.setState({ spellLanguages: ['en'] });
    await render();

    const orderBefore = Array.from(
      container.querySelectorAll<HTMLLIElement>('.settings__checklist li'),
    ).map((li) => li.dataset.tag);

    const arCheckbox = container.querySelector<HTMLInputElement>(
      '.settings__checklist li[data-tag="ar"] input[type="checkbox"]',
    )!;
    expect(arCheckbox.checked).toBe(false);
    act(() => {
      arCheckbox.click();
    });

    // The setting changed (ar is now ticked)...
    expect(useSettingsStore.getState().spellLanguages.includes('ar')).toBe(true);
    // ...but the row order - and in particular ar's position - did not.
    const orderAfter = Array.from(
      container.querySelectorAll<HTMLLIElement>('.settings__checklist li'),
    ).map((li) => li.dataset.tag);
    expect(orderAfter).toEqual(orderBefore);
    expect(
      container.querySelector<HTMLInputElement>(
        '.settings__checklist li[data-tag="ar"] input[type="checkbox"]',
      )?.checked,
    ).toBe(true);
  });

  it('disables the language checklist while spell check is off', async () => {
    mockSpellLanguages.mockResolvedValue(['en-US']);
    useSettingsStore.setState({ spellCheck: false });
    await render();
    const box = container.querySelector<HTMLInputElement>(
      '.settings__checklist input[type="checkbox"]',
    );
    expect(box?.disabled).toBe(true);
  });

  it('writes the explicit list on the first tick, starting from the automatic set', async () => {
    mockSpellLanguages.mockResolvedValue(['ar-SA', 'en-US']);
    await render();
    const arCheckbox = Array.from(
      container.querySelectorAll<HTMLInputElement>('.settings__checklist input[type="checkbox"]'),
    ).find((b) => !b.checked); // ar isn't the automatic pick, so it starts unticked
    expect(arCheckbox).toBeDefined();
    act(() => {
      arCheckbox!.click();
    });
    // Ticking ar alongside the automatically-ticked en writes both explicitly (as language codes).
    expect(useSettingsStore.getState().spellLanguages.sort()).toEqual(['ar', 'en']);
  });

  it('disables the sole ticked language so it cannot be unticked, and shows the hint', async () => {
    mockSpellLanguages.mockResolvedValue(['ar-SA', 'en-US']);
    await render();
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('.settings__checklist input[type="checkbox"]'),
    );
    const ticked = boxes.find((b) => b.checked);
    const unticked = boxes.find((b) => !b.checked);
    expect(ticked?.disabled).toBe(true); // the automatic en pick is the only ticked one
    expect(unticked?.disabled).toBe(false);

    const note = Array.from(container.querySelectorAll('.settings__note')).map(
      (n) => n.textContent,
    );
    expect(note.some((t) => t?.includes('To stop checking, turn off Check spelling.'))).toBe(true);

    // Clicking the disabled checkbox does nothing (browsers don't fire change on disabled
    // inputs, but assert the guard in toggleLanguage too).
    act(() => {
      ticked!.click();
    });
    expect(useSettingsStore.getState().spellLanguages).toEqual([]);
  });

  it('does not disable either checkbox once two languages are ticked', async () => {
    mockSpellLanguages.mockResolvedValue(['ar-SA', 'en-US']);
    useSettingsStore.setState({ spellLanguages: ['ar', 'en'] });
    await render();
    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('.settings__checklist input[type="checkbox"]'),
    );
    expect(boxes.every((b) => !b.disabled)).toBe(true);
  });

  it('removes a word from the personal dictionary', async () => {
    useSettingsStore.setState({ spellWords: ['teh', 'wiht'] });
    await render();
    const removeButton = container.querySelector<HTMLButtonElement>('[aria-label="Remove teh"]');
    expect(removeButton).not.toBeNull();
    act(() => {
      removeButton!.click();
    });
    expect(useSettingsStore.getState().spellWords).toEqual(['wiht']);
  });

  it('toggles the Check spelling setting', async () => {
    await render();
    const rows = Array.from(container.querySelectorAll('.settings__row'));
    const spellRow = rows.find((r) => r.textContent?.includes('Check spelling'));
    const toggle = spellRow?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
    act(() => {
      toggle!.click();
    });
    expect(useSettingsStore.getState().spellCheck).toBe(false);
  });

  it('unticks a language saved in the old regional tag format', async () => {
    // Existing users have regional tags like ["en-US", "ar-SA"] in their settings.
    // Clicking a checkbox should untick the language code correctly.
    mockSpellLanguages.mockResolvedValue(['ar-SA', 'en-US']);
    useSettingsStore.setState({ spellLanguages: ['en-US', 'ar-SA'] }); // Old format
    await render();

    // The Arabic checkbox starts ticked (from the old tag "ar-SA")
    const arCheckbox = container.querySelector<HTMLInputElement>(
      '.settings__checklist li[data-tag="ar"] input[type="checkbox"]',
    )!;
    expect(arCheckbox.checked).toBe(true);

    // Click to untick it
    act(() => {
      arCheckbox.click();
    });

    // Should now be saved as ["en"] (the only ticked language, in new format)
    expect(useSettingsStore.getState().spellLanguages).toEqual(['en']);
    expect(arCheckbox.checked).toBe(false);
  });

  it('lists F1 for the guide in the shortcuts table', async () => {
    await render();
    const rows = Array.from(container.querySelectorAll('.settings__shortcuts tr'));
    const guideRow = rows.find((r) => r.textContent?.includes('Guide'));
    expect(guideRow?.querySelector('kbd')?.textContent).toBe('F1');
  });
});
