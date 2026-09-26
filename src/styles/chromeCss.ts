import type { StylePreset } from '@/store/style';
import type { ResolvedTheme } from '@/lib/useAppTheme';

/**
 * Derives the app chrome palette (title bar, toolbar, sidebars, editor) from the active
 * preset's page colours so the window reads as one surface. Tints are mixed from the
 * preset's own background and text colours, which keeps them in the preset's hue.
 */
export function presetToChromeCss(preset: StylePreset, theme: ResolvedTheme): string {
  const c = preset.colors[theme];
  const mix = (pct: number) => `color-mix(in srgb, ${c.text} ${pct}%, ${c.bg})`;
  return `html:root[data-theme='${theme}'] {
  --content-bg: ${c.bg};
  --content-fg: ${c.text};
  --chrome-bg: ${mix(theme === 'dark' ? 5 : 4)};
  --chrome-titlebar-bg: ${theme === 'dark' ? `color-mix(in srgb, #000 35%, ${mix(5)})` : mix(10)};
  --chrome-fg: ${c.text};
  --chrome-fg-muted: ${c.muted};
  --chrome-border: ${c.border};
  --chrome-inset: ${mix(theme === 'dark' ? 10 : 8)};
  --chrome-hover: color-mix(in srgb, ${c.text} 9%, transparent);
  --sidebar-bg: ${mix(theme === 'dark' ? 3 : 2)};
  --accent: ${c.link};
}
`;
}
