import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { buildExportHtml } from '@/lib/export';
import { basename, isTauri, writeFile } from '@/lib/tauri';
import { useResolvedTheme } from '@/lib/useAppTheme';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useStyleStore } from '@/store/style';
import { useViewStore } from '@/store/view';
import { ICON } from './Toolbar';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until a rendered preview exists in the DOM (switching view if necessary). */
async function ensurePreview(): Promise<HTMLElement | null> {
  const settings = useSettingsStore.getState();
  const previous = settings.viewMode;
  if (previous === 'source') settings.set('viewMode', 'formatted');
  for (let i = 0; i < 40; i++) {
    const el = useViewStore.getState().previewScrollEl?.querySelector<HTMLElement>('.preview');
    if (el && el.innerHTML.trim()) {
      // give Mermaid a moment if diagrams are present
      if (el.querySelector('.mermaid-block:not([data-rendered])')) await sleep(300);
      return el;
    }
    await sleep(50);
  }
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
    const preview = await ensurePreview();
    if (!preview) return;
    const preset = presets.find((p) => p.id === activeId) ?? presets[0];
    const title = path ? basename(path).replace(/\.[^.]+$/, '') : 'Untitled';
    const html = buildExportHtml({ title, bodyHtml: preview.innerHTML, preset, theme });
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
    if (target) await writeFile(target, html);
  };

  const exportPdf = async () => {
    setOpen(false);
    const previous = useSettingsStore.getState().viewMode;
    const preview = await ensurePreview();
    if (!preview) return;
    await sleep(100);
    window.print();
    if (previous === 'source') useSettingsStore.getState().set('viewMode', previous);
  };

  return (
    <div className="toolbar__menu" ref={ref}>
      <button
        className={`toolbar__btn ${open ? 'is-active' : ''}`}
        title="Export"
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
