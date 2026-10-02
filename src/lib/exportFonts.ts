import { BUILTIN_FONTS, downloadedToFamilies, primaryFamily, resolveFamily } from '@/lib/fonts';
import { readFontFile, type DownloadedFont } from '@/lib/tauri';
import { useFontsStore } from '@/store/fonts';
import type { StylePreset } from '@/store/style';

/** One `@font-face` rule: the family, where its bytes are (a URL or a `data:` URL) and its range. */
export interface FaceDescriptor {
  family: string;
  src: string;
  weight: string;
  style: string;
  /** `''` if the face has no `unicode-range`. */
  unicodeRange: string;
}

/** The built-in CSS names and downloaded fonts a preset's font stacks ask for. */
export interface FontsToEmbed {
  builtin: string[];
  downloaded: DownloadedFont[];
}

/**
 * Picks the fonts an export should embed: the first family of the body, heading and code stacks
 * (an empty heading stack means "same as body"). Only built-in and downloaded Google fonts count;
 * installed fonts, generic keywords and unknown names are left to fall back as usual.
 */
export function fontsToEmbed(
  preset: Pick<StylePreset, 'typography'>,
  downloaded: DownloadedFont[],
): FontsToEmbed {
  const { bodyFont, headingFont, monoFont } = preset.typography;
  const stacks = [bodyFont, headingFont.trim() ? headingFont : bodyFont, monoFont];
  const lists = { builtin: BUILTIN_FONTS, downloaded: downloadedToFamilies(downloaded) };
  const builtin = new Set<string>();
  const ids = new Set<string>();
  for (const stack of stacks) {
    const hit = resolveFamily(stack, lists);
    if (hit?.source === 'builtin') builtin.add(hit.cssName);
    else if (hit?.source === 'google' && hit.downloaded && hit.googleId) ids.add(hit.googleId);
  }
  return { builtin: [...builtin], downloaded: downloaded.filter((f) => ids.has(f.id)) };
}

/** The first `url(...)` in a `src` descriptor, unquoted; null if there is none. */
export function firstUrl(src: string): string | null {
  const match = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/.exec(src);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

/** The faces, from all the `@font-face` rules on the page, that belong to these built-in fonts. */
export function selectBuiltinFaces(faces: FaceDescriptor[], cssNames: string[]): FaceDescriptor[] {
  const wanted = new Set(cssNames.map((n) => n.toLowerCase()));
  return faces.filter((f) => wanted.has(f.family.toLowerCase()));
}

/** Base64 of the bytes, built in chunks because one `fromCharCode(...bytes)` overflows the stack. */
export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** A `data:` URL for woff2 bytes. */
export function woff2DataUrl(buffer: ArrayBuffer): string {
  return `data:font/woff2;base64,${toBase64(buffer)}`;
}

/** Escapes text for a single-quoted CSS string that sits inside a `<style>` element. */
function cssString(s: string): string {
  return s.replace(/[\\'<]|\r?\n/g, (c) =>
    c === '<' ? '\\3c ' : c === '\\' || c === "'" ? `\\${c}` : '\\a ',
  );
}

/** A descriptor value with anything that could end the declaration or the element removed. */
function cssValue(s: string): string {
  return s.replace(/[;{}<>\\'"]/g, '').trim();
}

/** The `@font-face` rules for these faces; each `src` is already a `data:` URL. */
export function fontFaceCss(faces: FaceDescriptor[]): string {
  return faces
    .map((f) => {
      const decls = [
        `font-family:'${cssString(f.family)}'`,
        `font-style:${cssValue(f.style) || 'normal'}`,
        `font-weight:${cssValue(f.weight) || '400'}`,
        `font-display:swap`,
        `src:url(${f.src}) format('woff2')`,
      ];
      if (cssValue(f.unicodeRange)) decls.push(`unicode-range:${cssValue(f.unicodeRange)}`);
      return `@font-face{${decls.join(';')}}`;
    })
    .join('\n');
}

/**
 * Reads the built-in fonts' `@font-face` rules from the loaded stylesheets (`fonts.css`), so the
 * export uses exactly the files the app ships without a second copy in the bundle. A sheet that
 * can't be read (cross-origin) is skipped.
 */
export function collectFontFaceRules(
  sheets: ArrayLike<CSSStyleSheet> = document.styleSheets,
): FaceDescriptor[] {
  const out: FaceDescriptor[] = [];
  const walk = (rules: CSSRuleList, base: string) => {
    for (const rule of Array.from(rules)) {
      // 5 = CSSRule.FONT_FACE_RULE; the numeric type works in jsdom, where CSSFontFaceRule is absent.
      if (rule.type === 5) {
        const style = (rule as CSSFontFaceRule).style;
        const family = primaryFamily(style.getPropertyValue('font-family'));
        const url = firstUrl(style.getPropertyValue('src'));
        if (!family || !url) continue;
        out.push({
          family,
          src: url.startsWith('data:') ? url : new URL(url, base).href,
          weight: style.getPropertyValue('font-weight'),
          style: style.getPropertyValue('font-style'),
          unicodeRange: style.getPropertyValue('unicode-range'),
        });
      } else if ('cssRules' in rule) {
        walk((rule as CSSGroupingRule).cssRules, base);
      }
    }
  };
  for (const sheet of Array.from(sheets)) {
    try {
      walk(sheet.cssRules, sheet.href ?? document.baseURI);
    } catch {
      // Unreadable sheet (cross-origin): it holds none of the app's own fonts.
    }
  }
  return out;
}

async function fetchDataUrl(url: string): Promise<string> {
  // A data: URL is already embeddable (and the CSP's connect-src wouldn't allow fetching it).
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return woff2DataUrl(await res.arrayBuffer());
}

interface PendingFace {
  face: FaceDescriptor;
  /** Resolves to the face's `data:` URL. */
  load: () => Promise<string>;
}

/** Keeps the faces whose bytes could be loaded; a failed one is skipped, never fatal. */
async function embedFaces(pending: PendingFace[]): Promise<FaceDescriptor[]> {
  const loaded = await Promise.all(
    pending.map(({ face, load }) =>
      load().then(
        (src): FaceDescriptor => ({ ...face, src }),
        // The face stays out of the export and the text falls back; one bad file mustn't block it.
        () => null,
      ),
    ),
  );
  return loaded.filter((f): f is FaceDescriptor => f !== null);
}

/**
 * The `@font-face` CSS (with data: URLs) for the built-in and downloaded Google fonts the preset
 * uses; `''` if there are none. Never throws: an export without fonts beats no export.
 */
export async function loadFontCss(
  preset: Pick<StylePreset, 'typography'>,
  pageFaces: () => FaceDescriptor[] = collectFontFaceRules,
): Promise<string> {
  try {
    const downloaded = await useFontsStore.getState().loadDownloaded();
    const wanted = fontsToEmbed(preset, downloaded);
    const pending: PendingFace[] = [];
    if (wanted.builtin.length > 0) {
      for (const face of selectBuiltinFaces(pageFaces(), wanted.builtin)) {
        pending.push({ face, load: () => fetchDataUrl(face.src) });
      }
    }
    for (const font of wanted.downloaded) {
      for (const file of font.files) {
        pending.push({
          face: {
            family: font.family,
            src: '',
            weight: file.weight,
            style: file.style,
            unicodeRange: file.unicodeRange,
          },
          load: async () => woff2DataUrl(await readFontFile(font.id, file.file)),
        });
      }
    }
    return fontFaceCss(await embedFaces(pending));
  } catch {
    return '';
  }
}
