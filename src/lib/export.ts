import katex from 'katex';
import previewCss from '@/components/Preview/Preview.css?raw';
import { readAssetDataUrl } from '@/lib/tauri';
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
  /** When provided, inlined in a `<style>` tag instead of linked from the CDN. */
  katexCss?: string;
}

/**
 * Builds a self-contained HTML document reproducing the formatted view with the
 * active preset's styling baked in. Local images are rewritten from the app's asset
 * protocol to file:// URLs so they still resolve when the file is opened directly.
 */
export function buildExportHtml({
  title,
  bodyHtml,
  preset,
  theme,
  katexCss,
}: ExportOptions): string {
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
${needsKatex && !katexCss ? `<link rel="stylesheet" href="${KATEX_CSS_URL}">` : ''}
<style>
${css}
${katexCss ? `/* katex */\n${katexCss}` : ''}
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

/** Decodes and collects every local asset path from the HTML. */
export function assetPaths(html: string): string[] {
  const paths = new Set<string>();
  const regex = /(?:src|href)="http:\/\/(?:asset|mdasset)\.localhost\/([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    paths.add(decodeURIComponent(match[1]));
  }
  return Array.from(paths);
}

/** Replaces asset-protocol URLs with entries from the map (or falls back to file:// URLs). */
export function replaceAssetUrls(html: string, urls: ReadonlyMap<string, string>): string {
  return html.replace(
    /(src|href)="http:\/\/(?:asset|mdasset)\.localhost\/([^"]+)"/g,
    (_m, attr, enc) => {
      const path = decodeURIComponent(enc);
      const replacement = urls.get(path) || toFileUrl(path);
      return `${attr}="${replacement}"`;
    },
  );
}

/** http://asset.localhost/C%3A%5Cdir%5Cimg.png → file:///C:/dir/img.png */
export function rewriteAssetUrls(html: string): string {
  return html.replace(
    /(src|href)="http:\/\/(?:asset|mdasset)\.localhost\/([^"]+)"/g,
    (_m, attr, enc) => `${attr}="${toFileUrl(decodeURIComponent(enc))}"`,
  );
}

/** Replaces every local image in `html` with an embedded data: URL; any image that can't be
 * read keeps a file:// URL, so one bad image doesn't fail the export. */
export async function embedLocalImages(html: string): Promise<string> {
  const urls = new Map<string, string>();
  await Promise.all(
    assetPaths(html).map((p) =>
      readAssetDataUrl(p).then(
        (url) => void urls.set(p, url),
        // Unreadable (moved, too large, outside the folder): fall back to a file:// URL.
        () => undefined,
      ),
    ),
  );
  return replaceAssetUrls(html, urls);
}

/** The KaTeX stylesheet with its woff2 fonts inlined as data: URLs. The fonts are separate lazy
 * chunks, so none of this is loaded until an export needs it. */
export async function loadInlineKatexCss(): Promise<string> {
  const css = (await import('katex/dist/katex.min.css?raw')).default;
  const loaders = import.meta.glob<string>('/node_modules/katex/dist/fonts/*.woff2', {
    query: '?inline',
    import: 'default',
  });
  const fonts = new Map<string, string>();
  await Promise.all(
    Object.entries(loaders).map(async ([path, load]) => {
      fonts.set(path.slice(path.lastIndexOf('/') + 1), await load());
    }),
  );
  return inlineKatexFonts(css, fonts);
}

/** Rewrites KaTeX `@font-face` rules to use data: URLs instead of file system paths. */
export function inlineKatexFonts(css: string, fonts: ReadonlyMap<string, string>): string {
  // `src` is the last declaration in each minified rule, so stop at `;` or the rule's `}`.
  return css.replace(/src:\s*url\(fonts\/([^)]+\.woff2)\)[^;}]*/g, (m, filename: string) => {
    const dataUrl = fonts.get(filename);
    return dataUrl ? `src:url(${dataUrl}) format("woff2")` : m;
  });
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
