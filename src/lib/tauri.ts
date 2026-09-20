import { invoke, convertFileSrc } from '@tauri-apps/api/core';

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

export interface FileData {
  content: string;
  mtime: number;
}

export async function getLaunchArgs(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>('get_launch_args');
}

export function readFile(path: string): Promise<FileData> {
  return invoke<FileData>('read_file', { path });
}

export function writeFile(path: string, content: string): Promise<number> {
  return invoke<number>('write_file', { path, content });
}

/** Allows the asset protocol to serve files under `dir` (for relative images). */
export function allowAssetDir(dir: string): Promise<void> {
  return invoke('allow_asset_dir', { dir });
}

export const toAssetUrl = (absPath: string): string => convertFileSrc(absPath);

export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i < 0 ? path : path.slice(i + 1);
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
