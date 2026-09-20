import { useEffect } from 'react';

export type ShortcutHandler = (e: KeyboardEvent) => void;

/** Normalises a KeyboardEvent to a string like "ctrl+shift+e". */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  parts.push(key === ' ' ? 'space' : key);
  return parts.join('+');
}

/**
 * Registers app-wide keyboard shortcuts. Handlers run on keydown at the window level
 * (capture phase) so they win over CodeMirror's own bindings when needed.
 */
export function useShortcuts(map: Record<string, ShortcutHandler>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const handler = map[comboOf(e)];
      if (!handler) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [map]);
}
