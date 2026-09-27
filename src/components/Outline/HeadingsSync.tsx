import { useEffect } from 'react';
import { useDocumentStore } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import { extractHeadings } from '@/markdown/render';

/** Keeps the outline's headings current. In Source view it parses headings itself (cheap
 * headings-only parse); in Formatted and Split the Preview supplies them from its render. */
export function HeadingsSync() {
  const content = useDocumentStore((s) => s.content);
  const viewMode = useSettingsStore((s) => s.viewMode);
  const setHeadings = useViewStore((s) => s.setHeadings);

  useEffect(() => {
    if (viewMode !== 'source') return;
    const t = setTimeout(() => setHeadings(extractHeadings(content)), 150);
    return () => clearTimeout(t);
  }, [content, viewMode, setHeadings]);

  return null;
}
