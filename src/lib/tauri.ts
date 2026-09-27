import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

let readySent = false;

/** Tells the Rust side the first *themed* frame has painted, so it can show the window
 * (which starts hidden — see tauri.conf.json) without a flash of default colours.
 * Idempotent: only the first call actually emits, so a fallback timer and the real
 * ready signal can both call this without racing each other. */
export function emitAppReady(): void {
  if (!isTauri() || readySent) return;
  readySent = true;
  void emit('app-ready');
}

export type Encoding = 'utf8' | 'utf8-bom' | 'utf16-le' | 'utf16-be';

export interface FileData {
  content: string;
  mtime: number;
  encoding: Encoding;
  /** True when the file had bytes that aren't valid text; saving would replace them. */
  lossy: boolean;
}

export async function getLaunchArgs(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>('get_launch_args');
}

/** Files forwarded by later launches of the app, waiting to be opened (clears the queue). */
export async function takePendingOpens(): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>('take_pending_opens');
}

/** Starts another copy of the app showing `path` in its own window. */
export function openInNewWindow(path: string): Promise<void> {
  return invoke('open_in_new_window', { path });
}

export function readFile(path: string): Promise<FileData> {
  return invoke<FileData>('read_file', { path });
}

/** `encoding` defaults to UTF-8 (no BOM) on the Rust side when omitted. */
export function writeFile(path: string, content: string, encoding?: Encoding): Promise<number> {
  return invoke<number>('write_file', { path, content, encoding });
}

/** Restricts the mdasset:// protocol to serving files under `dir` (for relative
 * images), replacing whatever folder it previously served. `null` for an untitled
 * document, so nothing is servable until a document with a folder is open. */
export function setAssetRoot(dir: string | null): Promise<void> {
  return invoke('set_asset_root', { dir });
}

/** Reads an image under the current document's folder as a `data:` URL for embedding
 * in HTML export. Only works inside Tauri. */
export function readAssetDataUrl(path: string): Promise<string> {
  if (!isTauri()) return Promise.reject(new Error('readAssetDataUrl requires Tauri'));
  return invoke<string>('read_asset_data_url', { path });
}

export const toAssetUrl = (absPath: string): string => convertFileSrc(absPath, 'mdasset');

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? path : path.slice(i + 1);
}

/** Joins a relative path (which may use `/` or `\`, and `..`/`.` segments) onto `dir`. */
export function joinPath(dir: string, rel: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  const parts = dir.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join(sep);
}

/** decodeURI that never throws (malformed escapes are left as-is). */
export function safeDecodeURI(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

export interface FileChangedEvent {
  path: string;
  mtime: number;
  removed: boolean;
}

/** Starts watching `path` for external changes, alongside any files already watched. */
export function watchFile(path: string): Promise<void> {
  return invoke('watch_file', { path });
}

/** Stops watching `path` (other watched files keep their watches). */
export function unwatchFile(path: string): Promise<void> {
  return invoke('unwatch_file', { path });
}

/** Opens an http(s)/mailto link in the default browser or mail app (window.open outside Tauri). */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}

/** Shows the file selected in File Explorer (does nothing outside Tauri). */
export async function revealInExplorer(path: string): Promise<void> {
  if (!isTauri()) return;
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}
