import type { StylePreset } from '@/store/style';
import type { ResolvedTheme } from '@/lib/useAppTheme';

/**
 * Turns a preset into the CSS custom properties consumed by Preview.css.
 * Used both for the live preview (injected <style>) and for HTML export.
 */
export function presetToCssVars(
  preset: StylePreset,
  theme: ResolvedTheme,
  selector = '.app .preview',
): string {
  const t = preset.typography;
  const c = preset.colors[theme];
  const [h1, h2, h3, h4, h5, h6] = preset.headingScale;
  const headingFont = t.headingFont.trim() || t.bodyFont;
  return `${selector} {
  --md-bg: ${c.bg};
  --md-text: ${c.text};
  --md-heading: ${c.heading};
  --md-link: ${c.link};
  --md-muted: ${c.muted};
  --md-border: ${c.border};
  --md-code-bg: ${c.codeBg};
  --md-code-text: ${c.codeText};
  --md-quote-border: ${c.quoteBorder};
  --md-quote-text: ${c.quoteText};
  --md-table-border: ${c.tableBorder};
  --md-table-stripe: ${c.tableStripe};
  --md-hr: ${c.hr};
  --md-font-body: ${t.bodyFont};
  --md-font-heading: ${headingFont};
  --md-font-mono: ${t.monoFont};
  --md-font-size: ${t.baseSize}px;
  --md-line-height: ${t.lineHeight};
  --md-content-width: ${t.contentWidth}px;
  --md-paragraph-spacing: ${t.paragraphSpacing}em;
  --md-heading-weight: ${t.headingWeight};
  --md-h1: ${h1}em;
  --md-h2: ${h2}em;
  --md-h3: ${h3}em;
  --md-h4: ${h4}em;
  --md-h5: ${h5}em;
  --md-h6: ${h6}em;
}
${selector}-scroll { background: ${c.bg}; }
`;
}
