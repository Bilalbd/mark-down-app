import katex from 'katex';
import previewCss from '@/components/Preview/Preview.css?raw';
import type { ResolvedTheme } from '@/lib/useAppTheme';
import type { StylePreset } from '@/store/style';
import { presetToCssVars } from '@/styles/presetCss';

// Requires internet access to load; the exported HTML has no bundled fallback (see README).
const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css`;

export interface ExportOptions {
  title: string;
  /** The rendered preview's innerHTML (after Mermaid has drawn its SVGs). */
  bodyHtml: string;
  preset: StylePreset;
  theme: ResolvedTheme;
}

/**
 * Builds a self-contained HTML document reproducing the formatted view with the
 * active preset's styling baked in. Local images are rewritten from the app's asset
 * protocol to file:// URLs so they still resolve when the file is opened directly.
 */
export function buildExportHtml({ title, bodyHtml, preset, theme }: ExportOptions): string {
  const body = rewriteAssetUrls(bodyHtml);
  const needsKatex = body.includes('class="katex');
  const css = [
    '/* base */',
    `html,body{margin:0;padding:0;background:${preset.colors[theme].bg};}`,
    '.preview-scroll{height:auto;overflow:visible;}',
    '.preview{padding-bottom:80px;}',
    `.preview .shiki,.preview .shiki span{color:var(--shiki-${theme});}`,
    '.preview .mermaid-source{display:none;}',
    '/* preview */',
    previewCss,
    '/* preset */',
    presetToCssVars(preset, theme),
    preset.customCss ? `/* custom */\n${preset.customCss}` : '',
  ].join('\n');

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="generator" content="Markdown Viewer">
${needsKatex ? `<link rel="stylesheet" href="${KATEX_CSS_URL}">` : ''}
<style>
${css}
</style>
</head>
<body>
<div class="app"><div class="preview-scroll"><article class="preview">
${body}
</article></div></div>
</body>
</html>
`;
}

/** http://asset.localhost/C%3A%5Cdir%5Cimg.png → file:///C:/dir/img.png */
export function rewriteAssetUrls(html: string): string {
  return html.replace(
    /(src|href)="http:\/\/(?:asset|mdasset)\.localhost\/([^"]+)"/g,
    (_m, attr, enc) => `${attr}="${toFileUrl(decodeURIComponent(enc))}"`,
  );
}

/**
 * Converts a local filesystem path (`C:\dir\img.png` or a UNC `\\server\share\img.png`)
 * to a `file://` URL, percent-encoding each path segment so spaces, `#`, `%` and
 * non-ASCII characters survive, while leaving the drive letter and separators as-is.
 */
export function toFileUrl(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const unc = /^\/\/([^/]+)\/(.*)$/.exec(norm);
  if (unc) {
    const [, host, rest] = unc;
    return `file://${host}/${encodeSegments(rest)}`;
  }
  const drive = /^([a-zA-Z]:)\/(.*)$/.exec(norm);
  if (drive) {
    const [, letter, rest] = drive;
    return `file:///${letter}/${encodeSegments(rest)}`;
  }
  return `file://${encodeSegments(norm)}`;
}

function encodeSegments(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}
