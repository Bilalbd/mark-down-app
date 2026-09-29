import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TitleBar } from '@/components/TitleBar/TitleBar';
import { Outline } from '@/components/Outline/Outline';
import { StyleInjector } from '@/components/Preview/StyleInjector';
import { lineAtTop, scrollPreviewToLine } from '@/components/Preview/Preview';
import { renderMermaidBlocks } from '@/markdown/mermaid';
import { renderMarkdown } from '@/markdown/render';
import { classifyLink } from '@/lib/links';
import { emitGuideReady, isTauri, openExternal } from '@/lib/tauri';
import { useAppTheme } from '@/lib/useAppTheme';
import { useShortcuts } from '@/lib/shortcuts';
import { useSettingsStore } from '@/store/settings';
import { useStyleStore } from '@/store/style';
import { useViewStore } from '@/store/view';

/** Keys that would otherwise do something in the guide window (find, print, reload, help). */
const IGNORED_KEYS = ['f1', 'f5', 'ctrl+f', 'ctrl+p', 'ctrl+r', 'ctrl+shift+r'];

const LOAD_ERROR_HTML = "<p>The guide couldn't be loaded.</p>";

function closeGuideWindow(): void {
  if (!isTauri()) return;
  // Closing can only fail if the window is already gone.
  void getCurrentWindow()
    .close()
    .catch(() => undefined);
}

/** The guide's Markdown, loaded on demand so it stays out of the main window's startup path. */
async function loadGuideSource(): Promise<string> {
  return (await import('@/guide/Guide.md?raw')).default;
}

/**
 * The content of the guide window: the app's title bar, the outline and the formatted guide.
 * Nothing here edits, saves or opens documents.
 */
export function GuideWindow() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadStyles = useStyleStore((s) => s.load);
  const setHeadings = useViewStore((s) => s.setHeadings);
  const setTopLine = useViewStore((s) => s.setTopLine);
  const pendingScrollLine = useViewStore((s) => s.pendingScrollLine);
  const clearPendingScroll = useViewStore((s) => s.clearPendingScroll);
  const theme = useAppTheme();

  const [html, setHtml] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  // Startup: settings, presets and the rendered guide are all ready before the window is revealed,
  // so it never flashes the default colours or an empty page.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([loadSettings(), loadStyles()]);
      try {
        const result = await renderMarkdown(await loadGuideSource(), { blockRemoteImages: true });
        if (cancelled) return;
        setHeadings(result.headings);
        setHtml(result.html);
      } catch {
        if (!cancelled) setHtml(LOAD_ERROR_HTML);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSettings, loadStyles, setHeadings]);

  // Mermaid diagrams render client-side once the HTML is in the DOM (and again on theme change).
  // The window is revealed after they're drawn, so nothing jumps once it's on screen.
  useLayoutEffect(() => {
    if (!html) return;
    let cancelled = false;
    const root = articleRef.current;
    const drawn = root?.querySelector('.mermaid-block')
      ? renderMermaidBlocks(root, theme).catch(() => undefined) // a failed diagram shows its source
      : Promise.resolve();
    void drawn.then(() => {
      if (cancelled) return;
      requestAnimationFrame(() => requestAnimationFrame(emitGuideReady));
    });
    return () => {
      cancelled = true;
    };
  }, [html, theme]);

  // The look follows the main window: refreshed when this window gets focus. Only the theme and
  // the presets are read; the outline's width is this window's own until it closes.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        void useSettingsStore
          .getState()
          .refresh('appTheme')
          .catch(() => undefined);
        void useStyleStore
          .getState()
          .refresh()
          .catch(() => undefined);
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  // No right-click menu anywhere in this window.
  useEffect(() => {
    const onContextMenu = (e: globalThis.MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  const shortcuts = useMemo(
    () => ({
      escape: closeGuideWindow,
      'ctrl+w': closeGuideWindow,
      ...Object.fromEntries(IGNORED_KEYS.map((k) => [k, () => undefined])),
    }),
    [],
  );
  useShortcuts(shortcuts);

  // Outline click: scroll the guide to that heading's line.
  useEffect(() => {
    if (pendingScrollLine === null || !scrollRef.current || !html) return;
    scrollPreviewToLine(scrollRef.current, pendingScrollLine);
    clearPendingScroll();
  }, [pendingScrollLine, clearPendingScroll, html]);

  const onScroll = () => {
    if (scrollRef.current) setTopLine(lineAtTop(scrollRef.current));
  };

  // Every link is intercepted, so nothing can navigate this window: `#anchors` scroll, http(s) and
  // mailto open outside the app, and anything else does nothing.
  const onClick = (e: MouseEvent<HTMLElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (href === null) return;
    e.preventDefault();

    const link = classifyLink(href, null);
    if (link.kind === 'anchor') {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[id="${CSS.escape(link.id)}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (link.kind === 'external') {
      void openExternal(href).catch(() => undefined); // nothing useful to show if the OS refuses
    }
  };

  // Middle-click would otherwise let the webview open a new window on the raw href.
  const onAuxClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('a')) e.preventDefault();
  };

  return (
    <div className="app guide-window">
      <TitleBar fileName="Guide" allowTabs={false} />
      <main className="app__body">
        <Outline />
        <div className="app__content">
          <div className="preview-scroll" ref={scrollRef} onScroll={onScroll}>
            <article
              className="preview"
              style={{ '--md-zoom': 1 } as CSSProperties}
              ref={articleRef}
              onClick={onClick}
              onAuxClick={onAuxClick}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </main>
      <StyleInjector />
    </div>
  );
}
