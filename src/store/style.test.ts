import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS, normalizePreset, useStyleStore } from './style';
import { presetToCssVars } from '@/styles/presetCss';

describe('style store', () => {
  beforeEach(() => {
    useStyleStore.setState({ presets: BUILTIN_PRESETS, activePresetId: BUILTIN_PRESETS[0].id });
  });

  it('duplicates a built-in preset on edit and makes the copy active', () => {
    const s = useStyleStore.getState();
    expect(s.active().builtin).toBe(true);
    s.updateActive((p) => ({ ...p, typography: { ...p.typography, baseSize: 20 } }));
    const after = useStyleStore.getState();
    expect(after.active().builtin).toBe(false);
    expect(after.active().name).toBe('GitHub (custom)');
    expect(after.active().typography.baseSize).toBe(20);
    expect(after.presets.find((p) => p.id === BUILTIN_PRESETS[0].id)?.typography.baseSize).toBe(16);
  });

  it('refuses to delete or rename built-ins', () => {
    const s = useStyleStore.getState();
    s.remove(BUILTIN_PRESETS[1].id);
    s.rename(BUILTIN_PRESETS[1].id, 'x');
    expect(useStyleStore.getState().presets).toHaveLength(BUILTIN_PRESETS.length);
    expect(useStyleStore.getState().presets[1].name).toBe('Obsidian-like');
  });

  it('round-trips export → import and fills missing fields', () => {
    const s = useStyleStore.getState();
    const json = s.exportPreset(BUILTIN_PRESETS[2].id);
    expect(JSON.parse(json).builtin).toBeUndefined();
    const r = s.importPreset(json);
    expect(r.ok).toBe(true);
    expect(useStyleStore.getState().active().name).toBe('Claude-like');

    const partial = normalizePreset({ name: 'Mini', colors: { dark: { bg: '#000000' } } }, 'x');
    expect(partial?.colors.dark.bg).toBe('#000000');
    expect(partial?.colors.light.bg).toBe(BUILTIN_PRESETS[0].colors.light.bg);
    expect(normalizePreset({ nope: 1 }, 'x')).toBeNull();
    expect(s.importPreset('{not json').ok).toBe(false);
  });
});

describe('presetToCssVars', () => {
  it('emits the theme-specific colours and typography', () => {
    const css = presetToCssVars(BUILTIN_PRESETS[0], 'dark');
    expect(css).toContain('--md-bg: #0d1117');
    expect(css).toContain('--md-font-size: 16px');
    expect(css).toContain('--md-h1: 2em');
    expect(presetToCssVars(BUILTIN_PRESETS[0], 'light')).toContain('--md-bg: #ffffff');
  });
  it('falls back to the body font when no heading font is set', () => {
    const css = presetToCssVars(BUILTIN_PRESETS[0], 'light');
    expect(css).toContain(`--md-font-heading: ${BUILTIN_PRESETS[0].typography.bodyFont}`);
  });
});
