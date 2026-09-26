import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, normalizePreset, useStyleStore, type StylePreset } from './style';
import { presetToCssVars } from '@/styles/presetCss';

const builtin = (id: string): StylePreset => {
  const p = BUILTIN_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`no built-in preset ${id}`);
  return p;
};
const GITHUB = builtin('builtin-github');
const OBSIDIAN = builtin('builtin-obsidian');
const CLAUDE = builtin('builtin-claude');

describe('style store', () => {
  beforeEach(() => {
    useStyleStore.setState({ presets: BUILTIN_PRESETS, activePresetId: GITHUB.id });
  });

  it('duplicates a built-in preset on edit and makes the copy active', () => {
    const s = useStyleStore.getState();
    expect(s.active().builtin).toBe(true);
    s.updateActive((p) => ({ ...p, typography: { ...p.typography, baseSize: 20 } }));
    const after = useStyleStore.getState();
    expect(after.active().builtin).toBe(false);
    expect(after.active().name).toBe('GitHub (custom)');
    expect(after.active().typography.baseSize).toBe(20);
    expect(after.presets.find((p) => p.id === GITHUB.id)?.typography.baseSize).toBe(16);
  });

  it('refuses to delete or rename built-ins', () => {
    const s = useStyleStore.getState();
    s.remove(OBSIDIAN.id);
    s.rename(OBSIDIAN.id, 'x');
    expect(useStyleStore.getState().presets).toHaveLength(BUILTIN_PRESETS.length);
    expect(useStyleStore.getState().presets.find((p) => p.id === OBSIDIAN.id)?.name).toBe(
      'Obsidian',
    );
  });

  it('round-trips export → import and fills missing fields', () => {
    const s = useStyleStore.getState();
    const json = s.exportPreset(CLAUDE.id);
    expect(JSON.parse(json).builtin).toBeUndefined();
    const r = s.importPreset(json);
    expect(r.ok).toBe(true);
    expect(useStyleStore.getState().active().name).toBe('Claude');

    const partial = normalizePreset({ name: 'Mini', colors: { dark: { bg: '#000000' } } }, 'x');
    expect(partial?.colors.dark.bg).toBe('#000000');
    expect(partial?.colors.light.bg).toBe(BUILTIN_PRESETS[0].colors.light.bg);
    expect(normalizePreset({ nope: 1 }, 'x')).toBeNull();
    expect(s.importPreset('{not json').ok).toBe(false);
  });
});

// WCAG 2 relative luminance and contrast ratio, for checking the built-in presets stay readable.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('built-in presets', () => {
  it('are listed Boulayla, GitHub, Obsidian, Claude first, with Boulayla as the default', () => {
    expect(BUILTIN_PRESETS.slice(0, 4).map((p) => p.name)).toEqual([
      'Boulayla',
      'GitHub',
      'Obsidian',
      'Claude',
    ]);
    useStyleStore.setState({ presets: BUILTIN_PRESETS, activePresetId: 'no-such-preset' });
    expect(useStyleStore.getState().active().name).toBe('Boulayla');
  });

  it('have unique ids and are all marked built-in', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BUILTIN_PRESETS.every((p) => p.builtin)).toBe(true);
  });

  it.each(BUILTIN_PRESETS.flatMap((p) => (['light', 'dark'] as const).map((m) => [p.name, m, p])))(
    '%s (%s) keeps every text colour at 4.5:1 contrast or better',
    (_name, mode, preset) => {
      const c = (preset as StylePreset).colors[mode as 'light' | 'dark'];
      expect(contrast(c.text, c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.heading, c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.codeText, c.codeBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.muted, c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.quoteText, c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.link, c.bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('presetToCssVars', () => {
  it('emits the theme-specific colours and typography', () => {
    const css = presetToCssVars(GITHUB, 'dark');
    expect(css).toContain('--md-bg: #0d1117');
    expect(css).toContain('--md-font-size: 16px');
    expect(css).toContain('--md-h1: 2em');
    expect(presetToCssVars(GITHUB, 'light')).toContain('--md-bg: #ffffff');
  });
  it('falls back to the body font when no heading font is set', () => {
    const css = presetToCssVars(GITHUB, 'light');
    expect(css).toContain(`--md-font-heading: ${GITHUB.typography.bodyFont}`);
  });
});
