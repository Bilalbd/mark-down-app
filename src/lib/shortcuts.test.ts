import { describe, expect, it } from 'vitest';
import { comboOf } from '@/lib/shortcuts';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('comboOf', () => {
  it('matches the zoom shortcut combos', () => {
    expect(comboOf(key({ ctrlKey: true, key: '=' }))).toBe('ctrl+=');
    expect(comboOf(key({ ctrlKey: true, key: '+' }))).toBe('ctrl++'); // numpad plus, no shift
    expect(comboOf(key({ ctrlKey: true, shiftKey: true, key: '+' }))).toBe('ctrl+shift++');
    expect(comboOf(key({ ctrlKey: true, shiftKey: true, key: '=' }))).toBe('ctrl+shift+=');
    expect(comboOf(key({ ctrlKey: true, key: '-' }))).toBe('ctrl+-');
    expect(comboOf(key({ ctrlKey: true, key: '0' }))).toBe('ctrl+0');
  });

  it('treats Cmd (metaKey) the same as Ctrl', () => {
    expect(comboOf(key({ metaKey: true, key: 's' }))).toBe('ctrl+s');
  });

  it('normalises the space key to "space"', () => {
    expect(comboOf(key({ ctrlKey: true, key: ' ' }))).toBe('ctrl+space');
  });
});
