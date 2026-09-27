import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { assetPaths, buildExportHtml, inlineKatexFonts, replaceAssetUrls } from '@/lib/export';
import { basename, isTauri, readAssetDataUrl, writeFile } from '@/lib/tauri';
import { useResolvedTheme, type ResolvedTheme } from '@/lib/useAppTheme';
import { renderMermaidBlocks, whenMermaidIdle } from '@/markdown/mermaid';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useStyleStore } from '@/store/style';
import { useViewStore } from '@/store/view';
import { ICON } from './Toolbar';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PreviewHandle {
  el: HTMLElement;
  /** Switches the view mode back if ensurePreview switched away from Source. */
  restore: () => void;
}

/** Waits until a rendered preview exists in the DOM (switching view if necessary). */
async function ensurePreview(theme: ResolvedTheme): Promise<PreviewHandle | null> {
  const settings = useSettingsStore.getState();
  const previous = settings.viewMode;
  if (previous === 'source') settings.set('viewMode', 'formatted');
  const restore = () => {
    if (previous === 'source') useSettingsStore.getState().set('viewMode', previous);
  };
  for (let i = 0; i < 40; i++) {
    const el = useViewStore.getState().previewScrollEl?.querySelector<HTMLElement>('.preview');
    if (el) {
      if (el.querySelector('.mermaid-block')) {
        await renderMermaidBlocks(el, theme);
        await whenMermaidIdle();
      }
      return { el, restore };
    }
    await sleep(50);
  }
  restore();
  return null;
}

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = useDocumentStore((s) => s.path);
  const hasDocument = useDocumentStore((s) => s.hasDocument);
  const theme = useResolvedTheme();
  const presets = useStyleStore((s) => s.presets);
  const activeId = useStyleStore((s) => s.activePresetId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const exportHtml = async () => {
    setOpen(false);
    const preview = await ensurePreview(theme);
    if (!preview) return;
    try {
      const preset = presets.find((p) => p.id === activeId) ?? presets[0];
      const title = path ? basename(path).replace(/\.[^.]+$/, '') : 'Untitled';
      const selfContained = useSettingsStore.getState().selfContainedExport;
      let bodyHtml = preview.el.innerHTML;
      let katexCss: string | undefined;

      if (selfContained) {
        // Embed images as data URLs
        const paths = assetPaths(bodyHtml);
        const urls = new Map<string, string>();
        await Promise.all(
          paths.map(async (p) => {
            try {
              const url = await readAssetDataUrl(p);
              urls.set(p, url);
            } catch {
              // Fall back to file:// URL on error
            }
          }),
        );
        bodyHtml = replaceAssetUrls(bodyHtml, urls);

        // Inline KaTeX fonts if present
        if (bodyHtml.includes('class="katex')) {
          const katexCssRaw = await import('katex/dist/katex.min.css?raw').then(
            (m) => m.default,
          );
          const fontsGlob = import.meta.glob(
            '/node_modules/katex/dist/fonts/*.woff2',
            { query: '?inline', import: 'default' },
          );
          const fontMap = new Map<string, string>();
          await Promise.all(
            Object.entries(fontsGlob).map(async ([path, loader]) => {
              const filename = path.split('/').pop();
              if (filename && typeof loader === 'function') {
                const url = await (loader as () => Promise<{ default: string }>)();
                fontMap.set(filename, url.default);
              }
            }),
          );
          katexCss = inlineKatexFonts(katexCssRaw, fontMap);
        }
      }

      const html = buildExportHtml({ title, bodyHtml, preset, theme, katexCss });
      if (!isTauri()) {
        const blob = new Blob([html], { type: 'text/html' });
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(blob),
          download: `${title}.html`,
        });
        a.click();
        return;
      }
      const target = await saveDialog({
        defaultPath: `${title}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (!target) return;
      try {
        await writeFile(target, html);
      } catch (e) {
        useDocumentStore.setState({ error: `Could not export: ${String(e)}` });
      }
    } finally {
      preview.restore();
    }
  };

  const exportPdf = async () => {
    setOpen(false);
    const preview = await ensurePreview(theme);
    if (!preview) return;
    try {
      await sleep(100);
      window.print();
    } finally {
      preview.restore();
    }
  };

  return (
    <div className="toolbar__menu" ref={ref}>
      <button
        className={`toolbar__btn ${open ? 'is-active' : ''}`}
        title="Export"
        aria-label="Export"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!hasDocument}
        onClick={() => setOpen((v) => !v)}
      >
        <Download {...ICON} />
      </button>
      {open && (
        <div className="toolbar__dropdown" role="menu">
          <button role="menuitem" onClick={() => void exportHtml()}>
            Export as HTML…
          </button>
          <button role="menuitem" onClick={() => void exportPdf()}>
            Print / Save as PDF…
          </button>
        </div>
      )}
    </div>
  );
}
