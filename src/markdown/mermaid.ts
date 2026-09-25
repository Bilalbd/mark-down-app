import type { ResolvedTheme } from '@/lib/useAppTheme';

type Mermaid = typeof import('mermaid').default;

let mermaidPromise: Promise<Mermaid> | null = null;
let configuredTheme: ResolvedTheme | null = null;
let seq = 0;

/** Lazily loads Mermaid (it is ~2 MB) the first time a diagram is seen. */
async function getMermaid(theme: ResolvedTheme): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then((m) => m.default);
  const mermaid = await mermaidPromise;
  if (configuredTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
      suppressErrorRendering: true,
      fontFamily: 'inherit',
    });
    configuredTheme = theme;
  }
  return mermaid;
}

const inflight = new Set<Promise<void>>();

// Formatted view re-renders replace the whole preview DOM on every edit, so without a
// cache every Mermaid diagram would redraw (and flicker) on every keystroke in Split
// view. Keyed by theme+source, so a hit is safe to reuse verbatim.
const SVG_CACHE_LIMIT = 50;
const svgCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const svg = svgCache.get(key);
  if (svg !== undefined) {
    svgCache.delete(key); // bump to most-recently-used
    svgCache.set(key, svg);
  }
  return svg;
}

function cacheSet(key: string, svg: string): void {
  svgCache.delete(key);
  svgCache.set(key, svg);
  if (svgCache.size > SVG_CACHE_LIMIT) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
}

/**
 * Renders every `.mermaid-block` under `root` in place. Each block keeps its source in a
 * `<pre class="mermaid-source">` so re-rendering (e.g. on theme change) is idempotent.
 */
export async function renderMermaidBlocks(root: HTMLElement, theme: ResolvedTheme): Promise<void> {
  const run = renderMermaidBlocksInner(root, theme);
  inflight.add(run);
  try {
    await run;
  } finally {
    inflight.delete(run);
  }
}

async function renderMermaidBlocksInner(root: HTMLElement, theme: ResolvedTheme): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'));
  if (blocks.length === 0) return;
  // Loaded lazily, and only if at least one block isn't already cached.
  let mermaid: Mermaid | null = null;

  for (const block of blocks) {
    const source = block.querySelector<HTMLElement>('.mermaid-source')?.textContent ?? '';
    const key = `${theme}:${source}`;
    if (block.dataset.rendered === key) continue;
    block.dataset.rendered = key;

    block.querySelector('.mermaid-output')?.remove();
    const out = document.createElement('div');
    out.className = 'mermaid-output';

    const cached = cacheGet(key);
    if (cached !== undefined) {
      // securityLevel: 'strict' disables interactivity, so a cached SVG needs no
      // bindFunctions() call - it's identical to what a fresh render would produce.
      out.innerHTML = cached;
      block.classList.remove('is-error');
      block.appendChild(out);
      continue;
    }

    mermaid ??= await getMermaid(theme);
    try {
      const { svg, bindFunctions } = await mermaid.render(`mermaid-${++seq}`, source);
      out.innerHTML = svg;
      bindFunctions?.(out);
      block.classList.remove('is-error');
      cacheSet(key, svg);
    } catch (e) {
      out.className = 'mermaid-output mermaid-error';
      out.textContent = `Mermaid: ${(e as Error).message ?? String(e)}`;
      block.classList.add('is-error');
    }
    block.appendChild(out);
  }
}

/** Resolves once every in-flight `renderMermaidBlocks` call has settled. */
export async function whenMermaidIdle(): Promise<void> {
  while (inflight.size > 0) {
    await Promise.all(inflight);
  }
}
