import { describe, expect, it } from 'vitest';
import { presetToChromeCss } from '@/styles/chromeCss';
import { BUILTIN_PRESETS } from '@/store/style';

describe('presetToChromeCss', () => {
  const github = BUILTIN_PRESETS.find((p) => p.id === 'builtin-github');
  if (!github) throw new Error('GitHub preset not found');

  it('includes --chrome-titlebar-bg in light theme', () => {
    const css = presetToChromeCss(github, 'light');
    expect(css).toContain('--chrome-titlebar-bg:');
  });

  it('includes --chrome-titlebar-bg in dark theme', () => {
    const css = presetToChromeCss(github, 'dark');
    expect(css).toContain('--chrome-titlebar-bg:');
  });
});
