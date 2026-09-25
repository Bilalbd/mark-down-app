import type { EditorState } from '@codemirror/state';

// Editor states (undo history, selection, search) by document loadId. loadId is unique
// per load across tabs, so each tab's editor state survives switching away and back.
const cache = new Map<number, { state: EditorState; content: string }>();

/** Remembers the editor state for the document load `loadId`. */
export function cacheEditorState(loadId: number, state: EditorState): void {
  cache.set(loadId, { state, content: state.doc.toString() });
}

/** The cached state for `loadId`, if its text still matches `content`; otherwise null. */
export function cachedEditorState(loadId: number, content: string): EditorState | null {
  const entry = cache.get(loadId);
  if (!entry) return null;
  if (entry.content !== content) return null;
  return entry.state;
}

/** Drops every cached state whose loadId isn't in `live` (closed tabs, superseded loads). */
export function pruneEditorCache(live: Iterable<number>): void {
  const liveIds = new Set(live);
  for (const id of cache.keys()) {
    if (!liveIds.has(id)) {
      cache.delete(id);
    }
  }
}
