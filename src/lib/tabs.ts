import { basename } from '@/lib/tauri';

/** True when two paths refer to the same file, comparing case-insensitively and treating `/` and `\` as equal. */
export function samePath(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
  return normalize(a) === normalize(b);
}

/** Returns the id of the first tab whose path is non-null and matches `path` via samePath, else null. */
export function findTabByPath<T extends { id: string; path: string | null }>(
  tabs: readonly T[],
  path: string,
): string | null {
  for (const tab of tabs) {
    if (tab.path !== null && samePath(tab.path, path)) {
      return tab.id;
    }
  }
  return null;
}

/** True when the document is blank: no document file, or an empty untitled document. */
export function isBlankDocument(doc: {
  hasDocument: boolean;
  path: string | null;
  content: string;
  savedContent: string;
}): boolean {
  return !doc.hasDocument || (doc.path === null && doc.content === '' && doc.savedContent === '');
}

/** Returns the tab id to activate after closing `closingId`, or null if it was the only tab. */
export function nextActiveAfterClose(
  ids: readonly string[],
  closingId: string,
  activeId: string | null,
): string | null {
  if (closingId !== activeId) {
    return activeId;
  }

  const idx = ids.indexOf(closingId);
  if (idx < 0) {
    return activeId;
  }

  // Try to the right
  if (idx + 1 < ids.length) {
    return ids[idx + 1];
  }

  // Try to the left
  if (idx > 0) {
    return ids[idx - 1];
  }

  // It was the only tab
  return null;
}

/** Returns a new array with the item at `from` moved to `to`. Out-of-range `from` or `from === to` returns a copy unchanged. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || from === to) {
    return Array.from(items);
  }

  const result = Array.from(items);
  const item = result.splice(from, 1)[0];
  const clampedTo = Math.max(0, Math.min(to, items.length - 1));
  result.splice(clampedTo, 0, item);
  return result;
}

/** Returns one label per path in the same order: basenames, with parent-folder suffixes for duplicates. */
export function tabLabels(paths: readonly (string | null)[]): string[] {
  const result: string[] = [];
  let untitledIndex = 0;

  // First pass: assign Untitled numbers and collect non-null paths
  const pathLabels: Array<{ idx: number; path: string; base: string }> = [];
  for (let i = 0; i < paths.length; i++) {
    if (paths[i] === null) {
      untitledIndex += 1;
      result[i] = untitledIndex === 1 ? 'Untitled' : `Untitled ${untitledIndex}`;
    } else {
      const path = paths[i]!;
      // Normalize path to handle trailing separators
      const normalized = path.replace(/[\\/]+$/, '');
      pathLabels.push({ idx: i, path: normalized, base: basename(normalized) });
    }
  }

  // Group paths by basename (case-insensitive)
  const groups = new Map<string, typeof pathLabels>();
  for (const pl of pathLabels) {
    const key = pl.base.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pl);
  }

  // For each group, compute the smallest parent-folder suffix that makes all unique
  for (const group of groups.values()) {
    if (group.length === 1) {
      // Unique basename
      result[group[0].idx] = group[0].base;
    } else {
      // Duplicate basenames: add parent-folder suffixes
      let depthNeeded = 1;
      let done = false;

      while (!done && depthNeeded < 100) {
        const suffixes = new Set<string>();
        const newLabels: Array<{ idx: number; suffix: string }> = [];
        let allUnique = true;

        for (const pl of group) {
          const parts = pl.path.split(/[\\/]/);
          // Take depthNeeded parts before the filename
          const suffix = parts.slice(-depthNeeded - 1, -1).join('/');
          newLabels.push({ idx: pl.idx, suffix });
          if (suffixes.has(suffix)) {
            allUnique = false;
          } else {
            suffixes.add(suffix);
          }
        }

        if (allUnique) {
          // All suffixes are unique at this depth
          for (const nl of newLabels) {
            result[nl.idx] = nl.suffix ? `${group[0].base} · ${nl.suffix}` : group[0].base;
          }
          done = true;
        }

        depthNeeded += 1;
      }

      // Fallback: if we somehow didn't achieve uniqueness, just use full paths
      if (!done) {
        for (const pl of group) {
          result[pl.idx] = pl.path;
        }
      }
    }
  }

  return result;
}
