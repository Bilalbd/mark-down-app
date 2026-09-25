import { dirname, joinPath, safeDecodeURI } from '@/lib/tauri';

export type LinkClassification =
  | { kind: 'anchor'; id: string }
  | { kind: 'external' }
  | { kind: 'markdown'; path: string }
  | { kind: 'file'; path: string }
  | { kind: 'ignore' };

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);

/** Local/internal webview hosts that must never be treated as an external link. */
const INTERNAL_HOSTS = new Set([
  'asset.localhost',
  'mdasset.localhost',
  'localhost',
  'tauri.localhost',
]);

function extname(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i).toLowerCase();
}

/**
 * Decides what an anchor click in the preview should do, without performing any side
 * effects, so it can be unit-tested independently of the DOM/Tauri APIs it drives.
 */
export function classifyLink(href: string, docPath: string | null): LinkClassification {
  if (href.startsWith('#')) {
    const raw = href.slice(1);
    try {
      return { kind: 'anchor', id: decodeURIComponent(raw) };
    } catch {
      return { kind: 'anchor', id: raw };
    }
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === 'http' || scheme === 'https') {
      try {
        if (INTERNAL_HOSTS.has(new URL(href).hostname)) return { kind: 'ignore' };
      } catch {
        // Unparseable http(s) URL - fall through to treating it as external.
      }
      return { kind: 'external' };
    }
    if (scheme === 'mailto') return { kind: 'external' };
    return { kind: 'ignore' }; // javascript:, file:, asset:, data:, etc.
  }

  if (href.startsWith('//')) return { kind: 'ignore' }; // protocol-relative

  if (!docPath) return { kind: 'ignore' };
  const clean = safeDecodeURI(href.replace(/[?#].*$/, ''));
  if (!clean) return { kind: 'ignore' };
  const abs = joinPath(dirname(docPath), clean);
  return MARKDOWN_EXTENSIONS.has(extname(abs))
    ? { kind: 'markdown', path: abs }
    : { kind: 'file', path: abs };
}
