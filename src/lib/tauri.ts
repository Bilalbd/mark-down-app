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

export function watchFile(path: string): Promise<void> {
  return invoke('watch_file', { path });
}

export function unwatchFile(): Promise<void> {
  return invoke('unwatch_file');
}
