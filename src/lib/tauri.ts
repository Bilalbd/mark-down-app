import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { appDataDir } from '@tauri-apps/api/path';

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

/** Reads plain text from the system clipboard, through the clipboard-manager plugin. Falls back
 * to `navigator.clipboard` outside Tauri (tests, plain Vite dev). Inside Tauri this isn't just a
 * style choice: a fresh WebView2 profile leaves `navigator.clipboard.readText` on the
 * "clipboard-read" permission's "prompt" state indefinitely (nothing ever resolves it without a
 * click landing on WebView2's own prompt), so Paste from the editor menu would silently do
 * nothing on a first run - see Phase 4's Report. */
export function readClipboardText(): Promise<string> {
  if (!isTauri()) return navigator.clipboard.readText();
  return import('@tauri-apps/plugin-clipboard-manager').then(({ readText }) => readText());
}

/** Writes plain text to the system clipboard - see `readClipboardText`. */
export function writeClipboardText(text: string): Promise<void> {
  if (!isTauri()) return navigator.clipboard.writeText(text);
  return import('@tauri-apps/plugin-clipboard-manager').then(({ writeText }) => writeText(text));
}

/** The app's version from `tauri.conf.json`, or `null` outside Tauri or if the
 * call fails (a missing version only hides the line in Settings). */
export function getAppVersion(): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null);
  return getVersion().catch(() => null);
}

/** The folder that holds `settings.json` and `presets.json` (`%APPDATA%\com.bilal.markdown-viewer`),
 * or `null` outside Tauri or if it can't be resolved. It is the same folder the store plugin
 * writes to, which resolves relative file names against the app data directory. */
export function settingsFolder(): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null);
  return appDataDir().catch(() => null);
}

/** Shows the guide window, focusing it if it's already open (one per app process). Does nothing
 * outside Tauri. */
export function openGuideWindow(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invoke('open_guide_window');
}

let guideReadySent = false;

/** Tells the Rust side the guide has rendered, so it can reveal the guide window (which starts
 * hidden). Only the first call emits, like `emitAppReady`. */
export function emitGuideReady(): void {
  if (!isTauri() || guideReadySent) return;
  guideReadySent = true;
  void emit('guide-ready');
}

export interface SpellError {
  start: number;
  length: number;
  kind: 'misspelled' | 'repeated' | 'autocorrect';
}

/** Windows' installed spelling dictionaries, as BCP-47 language tags. `[]` outside Tauri. */
export function spellLanguages(): Promise<string[]> {
  if (!isTauri()) return Promise.resolve([]);
  return invoke<string[]>('spell_languages');
}

/** Checks each of `texts` against every supported language in `languages` (a range is only
 * reported if all of them reject it). Outside Tauri, resolves to one empty list per text. */
export function spellCheck(texts: string[], languages: string[]): Promise<SpellError[][]> {
  if (!isTauri()) return Promise.resolve(texts.map(() => []));
  return invoke<SpellError[][]>('spell_check', { texts, languages });
}

/** Suggestions for `word` from every supported language that rejects it. `[]` outside Tauri. */
export function spellSuggest(word: string, languages: string[]): Promise<string[]> {
  if (!isTauri()) return Promise.resolve([]);
  return invoke<string[]>('spell_suggest', { word, languages });
}

/** One font family installed on this PC, as listed by DirectWrite. */
export interface SystemFont {
  family: string;
  monospace: boolean;
  arabic: boolean;
}

let systemFontsPromise: Promise<SystemFont[]> | null = null;

/** The font families installed on this PC, cached for the session (fonts rarely change while the
 * app runs). `[]` outside Tauri, and also if listing fails, so the picker still works with its
 * other groups; a failure isn't cached, so the next call tries again. */
export function listSystemFonts(): Promise<SystemFont[]> {
  if (!isTauri()) return Promise.resolve([]);
  systemFontsPromise ??= invoke<SystemFont[]>('list_system_fonts').catch(() => {
    systemFontsPromise = null;
    return [];
  });
  return systemFontsPromise;
}

/** One Google font in the Fontsource catalogue (Google-sourced fonts only). */
export interface CatalogFont {
  id: string;
  family: string;
  category: string;
  subsets: string[];
  weights: number[];
  styles: string[];
  variable: boolean;
}

/** One downloaded font file. `weight` is ready for a `FontFace` descriptor: `"400"` for a static
 * file, a range such as `"200 900"` for a variable one. `unicodeRange` is `''` if there is none. */
export interface DownloadedFontFile {
  file: string;
  weight: string;
  style: string;
  unicodeRange: string;
}

/** A Google font downloaded into `<app data>/fonts/<id>/`, available offline. */
export interface DownloadedFont {
  id: string;
  family: string;
  category: string;
  files: DownloadedFontFile[];
}

/** The Google Fonts catalogue: the cached copy if it is under a week old (and `refresh` is false),
 * else fetched from Fontsource. Offline, an older cache is used. `[]` outside Tauri; rejects with
 * a message if there is no cache and the network fails. */
export function googleFontCatalog(refresh = false): Promise<CatalogFont[]> {
  if (!isTauri()) return Promise.resolve([]);
  return invoke<CatalogFont[]>('google_font_catalog', { refresh });
}

/** Downloads a Google font (its Latin, Latin Extended and Arabic alphabets) by Fontsource id.
 * Rejects with a message if offline or the download fails, and outside Tauri. */
export function downloadGoogleFont(id: string): Promise<DownloadedFont> {
  if (!isTauri()) return Promise.reject(new Error('downloadGoogleFont requires Tauri'));
  return invoke<DownloadedFont>('download_google_font', { id });
}

/** The Google fonts downloaded so far. `[]` outside Tauri. */
export function listDownloadedFonts(): Promise<DownloadedFont[]> {
  if (!isTauri()) return Promise.resolve([]);
  return invoke<DownloadedFont[]>('list_downloaded_fonts');
}

/** The bytes of one downloaded font file, for `new FontFace(name, bytes)`. Rejects outside Tauri. */
export function readFontFile(id: string, file: string): Promise<ArrayBuffer> {
  if (!isTauri()) return Promise.reject(new Error('readFontFile requires Tauri'));
  return invoke<ArrayBuffer>('read_font_file', { id, file });
}

/** Deletes a downloaded font and its files. Rejects outside Tauri. */
export function removeDownloadedFont(id: string): Promise<void> {
  if (!isTauri()) return Promise.reject(new Error('removeDownloadedFont requires Tauri'));
  return invoke('remove_downloaded_font', { id });
}
