import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CatalogFont, DownloadedFont, DownloadProgress, SystemFont } from '@/lib/tauri';
import { unregisterDownloadedFont } from '@/lib/fontLoader';
import { useFontsStore } from '@/store/fonts';
import { useDialogStore } from '@/components/Dialog/ConfirmDialog';
import { BUILTIN_PRESETS, useStyleStore, type StylePreset } from '@/store/style';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@/components/Toolbar/Toolbar', () => ({
  ICON: { size: 16, strokeWidth: 1.75, absoluteStrokeWidth: true },
}));

let installed: SystemFont[] = [];
let catalogResult: () => Promise<CatalogFont[]>;
let downloadedList: DownloadedFont[] = [];
const downloadMock =
  vi.fn<(id: string, onProgress?: (p: DownloadProgress) => void) => Promise<DownloadedFont>>();
const removeMock = vi.fn<(id: string) => Promise<void>>();
vi.mock('@/lib/tauri', () => ({
  listSystemFonts: () => Promise.resolve(installed),
  googleFontCatalog: () => catalogResult(),
  listDownloadedFonts: () => Promise.resolve(downloadedList),
  downloadGoogleFont: (id: string, onProgress?: (p: DownloadProgress) => void) =>
    downloadMock(id, onProgress),
  readFontFile: () => Promise.resolve(new ArrayBuffer(8)),
  removeDownloadedFont: (id: string) => removeMock(id),
}));

class FakeFace {
  constructor(
    public family: string,
    public source: unknown,
    public descriptors: unknown,
  ) {}
  load() {
    return Promise.resolve(this);
  }
}

import { FontPicker } from './FontPicker';

const SYSTEM: SystemFont[] = [
  { family: 'Arial', monospace: false, arabic: true },
  { family: 'Cascadia Code', monospace: true, arabic: false },
  { family: 'Consolas', monospace: true, arabic: false },
  { family: 'JetBrains Mono', monospace: true, arabic: false },
  { family: 'Segoe UI Variable Text', monospace: false, arabic: true },
];

function catalogFont(id: string, family: string, extra: Partial<CatalogFont> = {}): CatalogFont {
  return {
    id,
    family,
    category: 'sans-serif',
    subsets: ['latin'],
    weights: [400],
    styles: ['normal'],
    variable: false,
    ...extra,
  };
}

const CATALOG: CatalogFont[] = [
  catalogFont('literata', 'Literata', { category: 'serif' }),
  catalogFont('lora', 'Lora', { category: 'serif' }),
  catalogFont('arial', 'Arial'),
  catalogFont('amiri', 'Amiri', { category: 'serif', subsets: ['arabic', 'latin'] }),
  catalogFont('space-mono', 'Space Mono', { category: 'monospace' }),
];

/** Pretends the catalogue was loaded earlier in the session (by a picker opening). */
function loadCatalogFirst() {
  useFontsStore.setState({ catalog: CATALOG, catalogStatus: 'ready' });
}

const LITERATA: DownloadedFont = {
  id: 'literata',
  family: 'Literata',
  category: 'serif',
  files: [
    { file: 'latin-wght-normal.woff2', weight: '200 900', style: 'normal', unicodeRange: '' },
  ],
};

describe('FontPicker', () => {
  let container: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  let onChange: ReturnType<typeof vi.fn<(stack: string) => void>>;

  async function mount(props: {
    value: string;
    allowSame?: boolean;
    monospaceOnly?: boolean;
    label?: string;
  }) {
    const Harness = () => {
      const [value, setValue] = useState(props.value);
      return (
        <FontPicker
          label={props.label ?? 'Body font'}
          value={value}
          allowSame={props.allowSame}
          monospaceOnly={props.monospaceOnly}
          onChange={(v) => {
            onChange(v);
            setValue(v);
          }}
        />
      );
    };
    await act(async () => root.render(<Harness />));
    await settle();
  }

  beforeEach(() => {
    installed = SYSTEM;
    catalogResult = () => Promise.resolve(CATALOG);
    downloadedList = [];
    downloadMock.mockReset();
    removeMock.mockReset().mockResolvedValue(undefined);
    useStyleStore.setState({ presets: BUILTIN_PRESETS, activePresetId: BUILTIN_PRESETS[0].id });
    useFontsStore.setState({
      catalog: null,
      catalogStatus: 'idle',
      downloaded: [],
      downloadedLoaded: false,
    });
    vi.stubGlobal('FontFace', FakeFace);
    Object.defineProperty(document, 'fonts', {
      value: { add: vi.fn(), delete: vi.fn() },
      configurable: true,
    });
    onChange = vi.fn<(stack: string) => void>();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    useDialogStore.setState({ current: null });
    unregisterDownloadedFont('literata');
    vi.unstubAllGlobals();
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  const button = () => container.querySelector<HTMLButtonElement>('.font-picker__button')!;
  const search = () => container.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  const options = () => Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
  const optionNames = () => options().map((o) => o.textContent);
  const fontNames = () =>
    Array.from(container.querySelectorAll('.font-picker__row-name')).map((o) => o.textContent);
  const headers = () =>
    Array.from(container.querySelectorAll('.font-picker__group')).map((o) => o.textContent);
  // Lets the font lists (separate async calls) land before the next step.
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  const open = async () => {
    await act(async () => button().click());
    await settle();
  };
  const type = (text: string) =>
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(search(), text);
      search().dispatchEvent(new Event('input', { bubbles: true }));
    });
  const press = (key: string) =>
    act(() => {
      search().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

  it('opens a searchable list grouped as Built in, On this PC and Google Fonts', async () => {
    await mount({ value: "'Inter Variable', sans-serif" });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    await open();
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(search());
    expect(headers()).toEqual(['Built in', 'On this PC', 'Google Fonts']);
    expect(fontNames()).toContain('Inter');
    expect(fontNames()).toContain('Cascadia Code');
    expect(optionNames().at(-1)).toBe('Custom CSS font list…');
  });

  it('lists a font that is both built in and installed only once, under Built in', async () => {
    await mount({ value: 'Arial' });
    await open();
    expect(fontNames().filter((n) => n === 'JetBrains Mono')).toHaveLength(1);
    const row = options().find((o) => o.textContent?.startsWith('JetBrains Mono'))!;
    const builtinEnd = container.querySelectorAll('.font-picker__group')[1];
    expect(row.compareDocumentPosition(builtinEnd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the current built-in and installed fonts from preset stacks', async () => {
    await mount({ value: "'Inter Variable', Inter, 'Segoe UI Variable Text', sans-serif" });
    expect(button().textContent).toBe('InterBuilt in');
    act(() => root.unmount());
    root = createRoot(container);
    await mount({ value: "'Cascadia Code', 'Cascadia Mono', monospace" });
    expect(button().textContent).toBe('Cascadia CodeOn this PC');
  });

  it('filters as you type and keeps the custom row', async () => {
    await mount({ value: 'Arial' });
    await open();
    await type('casc');
    expect(fontNames()).toEqual(['Cascadia Code']);
    expect(headers()).toEqual(['On this PC']);
    expect(optionNames().at(-1)).toBe('Custom CSS font list…');
    await type('zzz');
    expect(fontNames()).toEqual([]);
    expect(container.textContent).toContain('No fonts match.');
  });

  it('selects with the keyboard and writes the font stack', async () => {
    await mount({ value: 'Arial' });
    await open();
    await type('lora');
    expect(search().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    await press('Enter');
    expect(onChange).toHaveBeenCalledWith("'Lora Variable', Georgia, serif");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('moves the highlight with Up, Down, Home and End', async () => {
    await mount({ value: 'Arial' });
    await open();
    await type('mono');
    const ids = () => options().map((o) => o.id);
    const active = () => search().getAttribute('aria-activedescendant');
    expect(active()).toBe(ids()[0]);
    await press('ArrowDown');
    expect(active()).toBe(ids()[1]);
    await press('End');
    expect(active()).toBe(ids().at(-1));
    await press('ArrowDown');
    expect(active()).toBe(ids()[0]);
    await press('ArrowUp');
    expect(active()).toBe(ids().at(-1));
    await press('Home');
    expect(active()).toBe(ids()[0]);
    expect(options()[0].classList.contains('is-active')).toBe(true);
  });

  it('writes an installed font when its row is clicked', async () => {
    await mount({ value: 'Arial' });
    await open();
    const row = options().find((o) => o.textContent?.startsWith('Cascadia Code'))!;
    await act(async () => row.click());
    expect(onChange).toHaveBeenCalledWith("'Cascadia Code', 'Cascadia Mono', Consolas, monospace");
  });

  it('closes on Escape and returns focus to the button', async () => {
    await mount({ value: 'Arial' });
    await open();
    await act(async () => {
      search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when clicking outside', async () => {
    await mount({ value: 'Arial' });
    await open();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('lists only monospace fonts for the Code font', async () => {
    await mount({ value: 'Consolas', monospaceOnly: true, label: 'Code font' });
    await open();
    expect(fontNames().sort()).toEqual([
      'Cascadia Code',
      'Consolas',
      'Fira Code',
      'IBM Plex Mono',
      'JetBrains Mono',
      'Source Code Pro',
      'Space Mono',
    ]);
  });

  it('keeps only Arabic-capable fonts with Supports Arabic', async () => {
    await mount({ value: 'Arial' });
    await open();
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => toggle.click());
    expect(fontNames().sort()).toEqual([
      'Amiri',
      'Arial',
      'IBM Plex Sans Arabic',
      'Noto Naskh Arabic',
      'Noto Sans Arabic',
      'Segoe UI Variable Text',
    ]);
  });

  it('offers Same as body for the heading font and writes a blank stack', async () => {
    await mount({ value: "'Lora Variable', serif", allowSame: true, label: 'Heading font' });
    await open();
    expect(optionNames()[0]).toBe('Same as body');
    await act(async () => options()[0].click());
    expect(onChange).toHaveBeenCalledWith('');
    expect(button().textContent).toBe('Same as body');
  });

  it('does not offer Same as body for the body font', async () => {
    await mount({ value: 'Arial' });
    await open();
    expect(optionNames()).not.toContain('Same as body');
  });

  it('marks a named family that is not installed, with no row selected', async () => {
    loadCatalogFirst();
    await mount({ value: 'Charter, Georgia, serif' });
    expect(button().textContent).toBe('CharterNot installed');
    expect(container.querySelector('input[type="text"]')).toBeNull();
    await open();
    expect(options().some((o) => o.getAttribute('aria-selected') === 'true')).toBe(false);
  });

  it('marks the selected row', async () => {
    await mount({ value: "'Inter Variable', sans-serif" });
    await open();
    const selected = options().filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected.map((o) => o.textContent)).toEqual(['InterSans']);
  });

  it('opens in custom mode for a stack starting with a generic keyword', async () => {
    await mount({ value: 'monospace' });
    expect(container.querySelector('.font-picker__button')).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe(
      'monospace',
    );
  });

  it('round-trips between the list and the custom input', async () => {
    await mount({ value: "'Inter Variable', sans-serif" });
    await open();
    await act(async () => options().at(-1)!.click());
    const input = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(input.value).toBe("'Inter Variable', sans-serif");
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('.font-picker__button')).toBeNull();

    const back = container.querySelector<HTMLButtonElement>('.font-picker__link')!;
    expect(back.textContent).toBe('Choose from list');
    await act(async () => back.click());
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(button().textContent).toBe('InterBuilt in');
    expect(document.activeElement).toBe(button());
  });

  it('caps a long group behind Show all and reveals the rest', async () => {
    installed = Array.from({ length: 80 }, (_, i) => ({
      family: `Sys ${String(i).padStart(2, '0')}`,
      monospace: false,
      arabic: false,
    }));
    await mount({ value: 'Arial' });
    await open();
    expect(fontNames().filter((n) => n?.startsWith('Sys'))).toHaveLength(50);
    const more = options().find((o) => o.textContent === 'Show all (80)')!;
    await act(async () => more.click());
    expect(fontNames().filter((n) => n?.startsWith('Sys'))).toHaveLength(80);
    expect(optionNames()).not.toContain('Show all (80)');
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('gives every row of a long list its own id, matching the highlighted one', async () => {
    installed = Array.from({ length: 1500 }, (_, i) => ({
      family: `Sys ${String(i).padStart(4, '0')}`,
      monospace: false,
      arabic: false,
    }));
    await mount({ value: 'Arial' });
    await open();
    await act(async () =>
      options()
        .find((o) => o.textContent === 'Show all (1500)')!
        .click(),
    );
    const ids = options().map((o) => o.id);
    expect(ids.length).toBeGreaterThan(1500);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => !id.endsWith('-undefined') && !id.endsWith('--1'))).toBe(true);
    expect(
      options().filter((o) => o.id === search().getAttribute('aria-activedescendant')),
    ).toHaveLength(1);
  });

  it('gives the trigger button a title with the full name and note', async () => {
    await mount({ value: "'Segoe UI Variable Text', sans-serif" });
    expect(button().title).toBe('Segoe UI Variable Text (On this PC)');
    act(() => root.unmount());
    root = createRoot(container);
    loadCatalogFirst();
    await mount({ value: 'Charter, Georgia, serif' });
    expect(button().title).toBe('Charter (Not installed)');
  });

  it('still works when no installed fonts can be listed', async () => {
    installed = [];
    await mount({ value: 'Arial' });
    await open();
    expect(headers()).toEqual(['Built in', 'Google Fonts']);
  });

  describe('Google Fonts group', () => {
    const rowFor = (name: string) =>
      options().find((o) => o.querySelector('.font-picker__row-name')?.textContent === name)!;
    const notes = () =>
      Array.from(container.querySelectorAll('.font-picker__empty')).map((n) => n.textContent);

    it('lists the catalogue once, leaving out fonts that are built in or installed', async () => {
      await mount({ value: 'Arial' });
      await open();
      expect(headers()).toEqual(['Built in', 'On this PC', 'Google Fonts']);
      expect(fontNames()).toContain('Literata');
      expect(fontNames()).toContain('Space Mono');
      expect(fontNames().filter((n) => n === 'Lora')).toHaveLength(1);
      expect(fontNames().filter((n) => n === 'Arial')).toHaveLength(1);
    });

    it('shows a loading row while the catalogue loads', async () => {
      let release!: (list: CatalogFont[]) => void;
      catalogResult = () => new Promise((resolve) => (release = resolve));
      await mount({ value: 'Arial' });
      await open();
      expect(headers()).toContain('Google Fonts');
      expect(notes()).toEqual(['Loading Google Fonts…']);
      expect(container.textContent).not.toContain('No fonts match.');
      await act(async () => release(CATALOG));
      expect(notes()).toEqual([]);
      expect(fontNames()).toContain('Literata');
    });

    it('says an internet connection is needed when the catalogue cannot load', async () => {
      catalogResult = () => Promise.reject(new Error('offline'));
      await mount({ value: 'Arial' });
      await open();
      expect(notes()).toEqual(['Needs an internet connection to add Google fonts']);
      expect(fontNames()).toContain('Inter');
    });

    it('lists downloaded fonts first, tagged and in their own face, even offline', async () => {
      catalogResult = () => Promise.reject(new Error('offline'));
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      const google = fontNames().slice(fontNames().indexOf('Literata'));
      expect(google).toEqual(['Literata']);
      const row = rowFor('Literata');
      expect(row.querySelector('.font-picker__row-tag')?.textContent).toBe('Serif · Downloaded');
      expect(row.querySelector<HTMLElement>('.font-picker__row-name')!.style.fontFamily).toContain(
        'Literata',
      );
      expect(notes()).toEqual(['Needs an internet connection to add Google fonts']);
    });

    it('does not preview fonts that are not downloaded', async () => {
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      expect(
        rowFor('Space Mono').querySelector<HTMLElement>('.font-picker__row-name')!.style.fontFamily,
      ).toBe('');
      expect(
        rowFor('Literata').querySelector<HTMLElement>('.font-picker__row-name')!.style.fontFamily,
      ).not.toBe('');
      const names = fontNames();
      expect(names.indexOf('Literata')).toBeLessThan(names.indexOf('Amiri'));
    });

    it('uses the catalogue subsets for Supports Arabic', async () => {
      await mount({ value: 'Arial' });
      await open();
      const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      await act(async () => toggle.click());
      expect(fontNames()).toContain('Amiri');
      expect(fontNames()).not.toContain('Literata');
    });

    it('downloads a font that is not downloaded, shows progress, then applies it', async () => {
      let finish!: (font: DownloadedFont) => void;
      downloadMock.mockImplementation((_id, onProgress) => {
        onProgress?.({ done: 3, total: 12 });
        return new Promise((resolve) => (finish = resolve));
      });
      await mount({ value: 'Arial' });
      await open();
      await act(async () => rowFor('Literata').click());
      expect(downloadMock).toHaveBeenCalledWith('literata', expect.any(Function));
      expect(rowFor('Literata').textContent).toContain('Downloading… 3/12');
      expect(button().textContent).toContain('Downloading… 3/12');
      expect(onChange).not.toHaveBeenCalled();
      expect(container.querySelector('[role="listbox"]')).not.toBeNull();

      await act(async () => finish(LITERATA));
      expect(onChange).toHaveBeenCalledWith("'Literata', Georgia, serif");
      expect(container.querySelector('[role="listbox"]')).toBeNull();
      expect(document.activeElement).toBe(button());
      expect(button().textContent).toBe('LiterataGoogle Fonts');
      expect(document.fonts.add).toHaveBeenCalledTimes(1);
    });

    it('shows a failed download on its row and applies nothing', async () => {
      downloadMock.mockRejectedValue("Couldn't reach the font server.");
      await mount({ value: 'Arial' });
      await open();
      await act(async () => rowFor('Literata').click());
      expect(rowFor('Literata').querySelector('[role="alert"]')?.textContent).toBe(
        "Couldn't reach the font server.",
      );
      expect(onChange).not.toHaveBeenCalled();
      expect(container.querySelector('[role="listbox"]')).not.toBeNull();
      expect(rowFor('Literata').textContent).not.toContain('Downloading');
    });

    it('applies a downloaded font straight away', async () => {
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await act(async () => rowFor('Literata').click());
      expect(downloadMock).not.toHaveBeenCalled();
      expect(onChange).toHaveBeenCalledWith("'Literata', Georgia, serif");
    });

    it('does not fetch the catalogue just because a picker is shown', async () => {
      const fetched = vi.fn(() => Promise.resolve(CATALOG));
      catalogResult = fetched;
      await mount({ value: "'Literata', Georgia, serif" });
      await mount({ value: 'Charter, Georgia, serif' });
      expect(fetched).not.toHaveBeenCalled();
      expect(button().textContent).toBe('Charter');
      expect(button().title).toBe('Charter');
    });

    it('shows just the name for an unknown family until the catalogue has loaded', async () => {
      await mount({ value: "'Literata', Georgia, serif" });
      expect(button().textContent).toBe('Literata');
      await open();
      expect(useFontsStore.getState().catalogStatus).toBe('ready');
      await act(async () => button().click());
      expect(button().textContent).toBe('LiterataGoogle Fonts · not downloaded');
    });

    it('notes a Google font in the preset that is not downloaded yet', async () => {
      loadCatalogFirst();
      await mount({ value: "'Literata', Georgia, serif" });
      expect(button().textContent).toBe('LiterataGoogle Fonts · not downloaded');
      expect(button().title).toBe('Literata (Google Fonts · not downloaded)');
      expect(button().querySelector<HTMLElement>('.font-picker__name')!.style.fontFamily).toBe('');
    });

    it('shows a downloaded Google font like any other, in its own face', async () => {
      downloadedList = [LITERATA];
      await mount({ value: "'Literata', Georgia, serif" });
      expect(button().textContent).toBe('LiterataGoogle Fonts');
      expect(button().querySelector<HTMLElement>('.font-picker__name')!.style.fontFamily).toContain(
        'Literata',
      );
    });
  });

  describe('removing downloaded fonts from the list', () => {
    const AMIRI_DL: DownloadedFont = {
      id: 'amiri',
      family: 'Amiri',
      category: 'serif',
      files: [{ file: 'latin-400-normal.woff2', weight: '400', style: 'normal', unicodeRange: '' }],
    };
    const rowFor = (name: string) =>
      options().find((o) => o.querySelector('.font-picker__row-name')?.textContent === name)!;
    const removeButton = (name: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${name}"]`);
    const hover = (name: string) =>
      act(() => {
        rowFor(name).dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      });
    const tagOf = (name: string) =>
      rowFor(name).querySelector('.font-picker__row-tag')?.textContent;
    const setCaret = (start: number, end = start) => search().setSelectionRange(start, end);
    /** Presses a key and says whether the picker took it over (called preventDefault). */
    const pressKey = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      act(() => {
        search().dispatchEvent(event);
      });
      return event.defaultPrevented;
    };
    const answer = async (id: string | null) => {
      await vi.waitFor(() => expect(useDialogStore.getState().current).not.toBeNull());
      await act(async () => useDialogStore.getState().close(id));
    };
    function usePresetWith(bodyFont: string) {
      const base = BUILTIN_PRESETS[0];
      const preset: StylePreset = {
        ...base,
        id: 'mine',
        name: 'Mine',
        builtin: false,
        typography: { ...base.typography, bodyFont },
      };
      useStyleStore.setState({ presets: [...BUILTIN_PRESETS, preset], activePresetId: 'mine' });
    }

    it('gives only downloaded Google fonts a x button, shown on the highlighted row', async () => {
      downloadedList = [AMIRI_DL, LITERATA];
      await mount({ value: 'Arial' });
      await open();
      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.font-picker__remove'),
      );
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Remove Amiri',
        'Remove Literata',
      ]);
      expect(buttons[0].title).toBe('Remove from this PC (Delete)');
      expect(buttons[0].tabIndex).toBe(-1);
      expect(options().filter((o) => o.querySelector('button')).length).toBe(2);
      // Hidden by CSS (not removed) unless inside the highlighted row.
      expect(buttons.map((b) => !!b.closest('.is-active'))).toEqual([false, false]);
      await hover('Literata');
      expect(buttons.map((b) => !!b.closest('.is-active'))).toEqual([false, true]);
    });

    it('removes the font on click without applying the row, keeping the list open', async () => {
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await hover('Literata');
      expect(tagOf('Literata')).toBe('Serif · Downloaded');
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      removeButton('Literata')!.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      await act(async () => removeButton('Literata')!.click());
      await settle();
      expect(removeMock).toHaveBeenCalledWith('literata');
      expect(useDialogStore.getState().current).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      expect(container.querySelector('[role="listbox"]')).not.toBeNull();
      expect(document.activeElement).toBe(search());
      expect(removeButton('Literata')).toBeNull();
      expect(tagOf('Literata')).toBe('Serif');
      expect(
        rowFor('Literata').querySelector<HTMLElement>('.font-picker__row-name')!.style.fontFamily,
      ).toBe('');
      expect(search().getAttribute('aria-activedescendant')).toBe(rowFor('Literata').id);
    });

    it('moves the highlight to the nearest font when the row disappears', async () => {
      catalogResult = () => Promise.reject(new Error('offline'));
      downloadedList = [AMIRI_DL, LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await hover('Amiri');
      await act(async () => removeButton('Amiri')!.click());
      await settle();
      expect(fontNames()).not.toContain('Amiri');
      expect(search().getAttribute('aria-activedescendant')).toBe(rowFor('Literata').id);
    });

    it('removes the highlighted font with Delete at the end of the search text', async () => {
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await type('liter');
      setCaret(5);
      expect(pressKey('Delete')).toBe(true);
      await settle();
      expect(removeMock).toHaveBeenCalledWith('literata');
      expect(search().value).toBe('liter');
      expect(tagOf('Literata')).toBe('Serif');
    });

    it('removes with Delete when the search box is empty', async () => {
      downloadedList = [LITERATA];
      await mount({ value: "'Literata', Georgia, serif" });
      await open();
      expect(search().getAttribute('aria-activedescendant')).toBe(rowFor('Literata').id);
      expect(pressKey('Delete')).toBe(true);
      await settle();
      expect(removeMock).toHaveBeenCalledWith('literata');
    });

    it('leaves Delete to edit the text when the caret is not at the end or text is selected', async () => {
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await type('liter');
      setCaret(2);
      expect(pressKey('Delete')).toBe(false);
      setCaret(0, 5);
      expect(pressKey('Delete')).toBe(false);
      await settle();
      expect(removeMock).not.toHaveBeenCalled();
    });

    it('ignores Delete when the highlighted row is not a downloaded Google font', async () => {
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await type('lora');
      setCaret(4);
      expect(pressKey('Delete')).toBe(false);
      await settle();
      expect(removeMock).not.toHaveBeenCalled();
    });

    it('asks first when the active preset uses the font, and keeps it on Cancel', async () => {
      usePresetWith("'Literata', Georgia, serif");
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await type('liter');
      pressKey('Delete');
      const dialog = useDialogStore.getState().current!;
      expect(dialog.title).toBe('Remove Literata?');
      expect(dialog.message).toContain('"Mine" preset uses this font');
      await answer('cancel');
      expect(removeMock).not.toHaveBeenCalled();
      expect(tagOf('Literata')).toBe('Serif · Downloaded');
    });

    it('removes after confirming and leaves the preset using the font', async () => {
      usePresetWith("'Literata', Georgia, serif");
      downloadedList = [LITERATA];
      await mount({ value: "'Literata', Georgia, serif" });
      await open();
      await act(async () => removeButton('Literata')!.click());
      await answer('remove');
      await settle();
      expect(removeMock).toHaveBeenCalledWith('literata');
      expect(useStyleStore.getState().active().typography.bodyFont).toBe(
        "'Literata', Georgia, serif",
      );
      expect(button().textContent).toBe('LiterataGoogle Fonts · not downloaded');
    });

    it('shows a failed removal on its row and keeps the font downloaded', async () => {
      removeMock.mockRejectedValue('Access is denied.');
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await hover('Literata');
      await act(async () => removeButton('Literata')!.click());
      await settle();
      expect(rowFor('Literata').querySelector('[role="alert"]')?.textContent).toBe(
        'Could not remove: Access is denied.',
      );
      expect(tagOf('Literata')).toBe('Serif · Downloaded');
      expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    });

    it('does not start a second removal while one is running', async () => {
      let finish!: () => void;
      removeMock.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
      downloadedList = [LITERATA];
      await mount({ value: 'Arial' });
      await open();
      await hover('Literata');
      await act(async () => removeButton('Literata')!.click());
      await act(async () => removeButton('Literata')!.click());
      pressKey('Delete');
      expect(removeMock).toHaveBeenCalledTimes(1);
      await act(async () => finish());
    });
  });
});
