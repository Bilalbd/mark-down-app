import MarkdownIt, { type Env, type Token } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import { katex } from '@mdit/plugin-katex';
import { headingIds, sourceLines, taskLists, type HeadingInfo } from './plugins';
import { ensureLanguages, getHighlighter, highlightSync } from './shiki';
import { sanitizeHtml } from './sanitize';
import { joinPath, safeDecodeURI } from '@/lib/tauri';

export interface RenderEnv extends Env {
  /** Absolute directory of the open file, used to resolve relative image paths. */
  baseDir?: string;
  /** Converts an absolute local path to a URL the webview can load. */
  toAssetUrl?: (absPath: string) => string;
  headings?: HeadingInfo[];
  /** Strips remote (http/https) image sources instead of loading them. */
  blockRemoteImages?: boolean;
}

export interface RenderResult {
  html: string;
  headings: HeadingInfo[];
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
})
  .use(footnote)
  .use(katex, { throwOnError: false, delimiters: 'dollars', allowInlineWithSpace: false })
  .use(sourceLines)
  .use(taskLists)
  .use(headingIds);

// Resolve relative image sources against the document directory.
const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const renv = (env ?? {}) as RenderEnv;
  const token = tokens[idx];
  const src = String(token.attrGet('src') ?? '');
  if (renv.baseDir && renv.toAssetUrl && isRelative(src)) {
    const clean = safeDecodeURI(src.replace(/[?#].*$/, ''));
    token.attrSet('src', renv.toAssetUrl(joinPath(renv.baseDir, clean)));
  }
  return defaultImage(tokens, idx, options, env, self);
};

// Fenced code: highlight synchronously with an already-primed Shiki highlighter.
md.renderer.rules.fence = (tokens, idx, _options, env) => {
  const renv = (env ?? {}) as RenderEnv & { __hl?: HighlighterLike };
  const token = tokens[idx];
  const lang = (token.info || '').trim().split(/\s+/)[0] || 'text';
  const line = token.attrGet('data-line');
  const attrs = line
    ? ` data-line="${line}" data-line-end="${token.attrGet('data-line-end')}"`
    : '';
  if (lang === 'mermaid') {
    return `<div class="mermaid-block"${attrs}><pre class="mermaid-source">${md.utils.escapeHtml(token.content)}</pre></div>\n`;
  }
  const hl = renv.__hl;
  const inner = hl
    ? highlightSync(hl, token.content, lang)
    : `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre>`;
  return `<div class="code-block" data-lang="${md.utils.escapeHtml(lang)}"${attrs}>${inner}</div>\n`;
};

type HighlighterLike = Awaited<ReturnType<typeof getHighlighter>>;

function isRelative(src: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src);
}

function collectFenceLangs(tokens: Token[]): string[] {
  const langs: string[] = [];
  for (const t of tokens) {
    if (t.type === 'fence') {
      const lang = (t.info || '').trim().split(/\s+/)[0];
      if (lang && lang !== 'mermaid') langs.push(lang);
    }
  }
  return langs;
}

/**
 * Full render pipeline: parse → prime highlighter for used languages → render → sanitize.
 */
export async function renderMarkdown(source: string, env: RenderEnv = {}): Promise<RenderResult> {
  const renderEnv: RenderEnv & { __hl?: HighlighterLike } = { ...env };
  const tokens = md.parse(source, renderEnv);
  const langs = collectFenceLangs(tokens);
  if (langs.length > 0) {
    await ensureLanguages(langs);
    renderEnv.__hl = await getHighlighter();
  }
  const raw = md.renderer.render(tokens, md.options, renderEnv);
  return {
    html: sanitizeHtml(raw, { blockRemoteImages: env.blockRemoteImages }),
    headings: renderEnv.headings ?? [],
  };
}

/** Synchronous headings-only parse (cheap; used when only the outline is needed). */
export function extractHeadings(source: string): HeadingInfo[] {
  const env: RenderEnv = {};
  md.parse(source, env);
  return env.headings ?? [];
}
