import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SystemFont } from '@/lib/tauri';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@/components/Toolbar/Toolbar', () => ({
  ICON: { size: 16, strokeWidth: 1.75, absoluteStrokeWidth: true },
}));

let installed: SystemFont[] = [];
vi.mock('@/lib/tauri', () => ({
  listSystemFonts: () => Promise.resolve(installed),
}));

import { FontPicker } from './FontPicker';

const SYSTEM: SystemFont[] = [
  { family: 'Arial', monospace: false, arabic: true },
  { family: 'Cascadia Code', monospace: true, arabic: false },
  { family: 'Consolas', monospace: true, arabic: false },
  { family: 'JetBrains Mono', monospace: true, arabic: false },
  { family: 'Segoe UI Variable Text', monospace: false, arabic: true },
];

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
  }

  beforeEach(() => {
    installed = SYSTEM;
    onChange = vi.fn<(stack: string) => void>();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
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
  const open = () => act(() => button().click());
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
    ]);
  });

  it('keeps only Arabic-capable fonts with Supports Arabic', async () => {
    await mount({ value: 'Arial' });
    await open();
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => toggle.click());
    expect(fontNames().sort()).toEqual([
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

  it('still works when no installed fonts can be listed', async () => {
    installed = [];
    await mount({ value: 'Arial' });
    await open();
    expect(headers()).toEqual(['Built in', 'Google Fonts']);
  });
});
