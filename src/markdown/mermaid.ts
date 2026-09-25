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
  const mermaid = await getMermaid(theme);

  for (const block of blocks) {
    const source = block.querySelector<HTMLElement>('.mermaid-source')?.textContent ?? '';
    const key = `${theme}:${source}`;
    if (block.dataset.rendered === key) continue;
    block.dataset.rendered = key;

    block.querySelector('.mermaid-output')?.remove();
    const out = document.createElement('div');
    out.className = 'mermaid-output';
    try {
      const { svg, bindFunctions } = await mermaid.render(`mermaid-${++seq}`, source);
      out.innerHTML = svg;
      bindFunctions?.(out);
      block.classList.remove('is-error');
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
