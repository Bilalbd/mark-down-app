import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import type { HeadingInfo } from '@/markdown/plugins';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import './Outline.css';

export interface OutlineNode extends HeadingInfo {
  children: OutlineNode[];
}

/** Builds a tree from the flat heading list; deeper levels nest under the nearest shallower one. */
export function buildTree(headings: HeadingInfo[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const h of headings) {
    const node: OutlineNode = { ...h, children: [] };
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    (stack.length ? stack[stack.length - 1].children : root).push(node);
    stack.push(node);
  }
  return root;
}

/** The heading whose section contains `line` (last heading starting at or before it). */
export function activeHeadingFor(headings: HeadingInfo[], line: number): HeadingInfo | null {
  let active: HeadingInfo | null = null;
  for (const h of headings) {
    if (h.line <= line) active = h;
    else break;
  }
  return active;
}

/** Ids of every node that has children, i.e. every node a twisty could collapse. */
export function collapsibleIds(nodes: OutlineNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: OutlineNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        ids.push(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

/** Parents (nodes with children) that are visible given `collapsed`, with their depth. */
export function visibleParents(
  tree: OutlineNode[],
  collapsed: ReadonlySet<string>,
): { id: string; depth: number; collapsed: boolean }[] {
  const result: { id: string; depth: number; collapsed: boolean }[] = [];
  const walk = (list: OutlineNode[], depth: number, ancestorCollapsed: boolean) => {
    for (const n of list) {
      // A node is visible if none of its ancestors are collapsed
      const isNodeVisible = !ancestorCollapsed;
      if (n.children.length > 0 && isNodeVisible) {
        result.push({ id: n.id, depth, collapsed: collapsed.has(n.id) });
      }
      // Children are hidden if this node is collapsed, OR if an ancestor is already collapsed
      const childAncestorCollapsed = ancestorCollapsed || collapsed.has(n.id);
      if (n.children.length > 0) {
        walk(n.children, depth + 1, childAncestorCollapsed);
      }
    }
  };
  walk(tree, 0, false);
  return result;
}

/** `collapsed` after expanding the shallowest level of visible collapsed parents. */
export function expandOneLevel(tree: OutlineNode[], collapsed: ReadonlySet<string>): Set<string> {
  const visible = visibleParents(tree, collapsed);
  const collapsedVisible = visible.filter((p) => p.collapsed);
  if (collapsedVisible.length === 0) return new Set(collapsed);

  const minDepth = Math.min(...collapsedVisible.map((p) => p.depth));
  const next = new Set(collapsed);
  for (const p of collapsedVisible) {
    if (p.depth === minDepth) next.delete(p.id);
  }
  return next;
}

/** `collapsed` after collapsing the deepest level of visible expanded parents. */
export function collapseOneLevel(tree: OutlineNode[], collapsed: ReadonlySet<string>): Set<string> {
  const visible = visibleParents(tree, collapsed);
  const expandedVisible = visible.filter((p) => !p.collapsed);
  if (expandedVisible.length === 0) return new Set(collapsed);

  const maxDepth = Math.max(...expandedVisible.map((p) => p.depth));
  const next = new Set(collapsed);
  for (const p of expandedVisible) {
    if (p.depth === maxDepth) next.add(p.id);
  }
  return next;
}

/** Which of the four level actions would change anything. */
export function levelActions(
  tree: OutlineNode[],
  collapsed: ReadonlySet<string>,
): { canExpand: boolean; canCollapse: boolean } {
  const allParents = collapsibleIds(tree);
  const canExpand = allParents.some((id) => collapsed.has(id));

  const visible = visibleParents(tree, collapsed);
  const canCollapse = visible.some((p) => !p.collapsed);

  return { canExpand, canCollapse };
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

export function Outline() {
  const headings = useViewStore((s) => s.headings);
  const topLine = useViewStore((s) => s.topLine);
  const requestScrollToLine = useViewStore((s) => s.requestScrollToLine);
  const width = useSettingsStore((s) => s.outlineWidth);
  const set = useSettingsStore((s) => s.set);
  const persist = useSettingsStore((s) => s.persist);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(headings), [headings]);
  const allParentIds = useMemo(() => collapsibleIds(tree), [tree]);
  const activeId = useMemo(
    () => activeHeadingFor(headings, topLine)?.id ?? null,
    [headings, topLine],
  );

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(activeId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const levelActionState = useMemo(() => levelActions(tree, collapsed), [tree, collapsed]);

  const onItemKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    n: OutlineNode,
    isCollapsed: boolean,
    hasChildren: boolean,
  ) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        requestScrollToLine(n.line);
        return;
      case 'ArrowRight':
        if (hasChildren && isCollapsed) {
          e.preventDefault();
          toggle(n.id);
        }
        return;
      case 'ArrowLeft':
        if (hasChildren && !isCollapsed) {
          e.preventDefault();
          toggle(n.id);
        }
        return;
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const items = Array.from(
          listRef.current?.querySelectorAll<HTMLElement>('.outline__item') ?? [],
        );
        const idx = items.indexOf(e.currentTarget);
        if (idx === -1) return;
        const next = items[e.key === 'ArrowDown' ? idx + 1 : idx - 1];
        next?.focus();
        return;
      }
    }
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      set('outlineWidth', Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + ev.clientX - startX)), {
        persist: false,
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing');
      persist('outlineWidth');
    };
    document.body.classList.add('is-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderNodes = (nodes: OutlineNode[], depth: number) => (
    <ul className="outline__list" role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((n) => {
        const isCollapsed = collapsed.has(n.id);
        const hasChildren = n.children.length > 0;
        return (
          <li key={n.id} role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined}>
            <div
              className={`outline__item ${n.id === activeId ? 'is-active' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              data-id={n.id}
              title={n.text}
              tabIndex={0}
              onClick={() => requestScrollToLine(n.line)}
              onKeyDown={(e) => onItemKeyDown(e, n, isCollapsed, hasChildren)}
            >
              <button
                className={`outline__twisty ${hasChildren ? '' : 'is-hidden'}`}
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                tabIndex={hasChildren ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(n.id);
                }}
              >
                <ChevronRight
                  size={12}
                  strokeWidth={1.75}
                  absoluteStrokeWidth
                  className={`outline__chevron ${isCollapsed ? '' : 'is-open'}`}
                />
              </button>
              <span className={`outline__text outline__text--h${n.level}`}>
                {n.text || '(untitled)'}
              </span>
            </div>
            {hasChildren && !isCollapsed && renderNodes(n.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="outline" style={{ width }} aria-label="Document outline">
      <div className="outline__header">
        <span>Outline</span>
        {allParentIds.length > 0 && (
          <div className="outline__actions" role="group" aria-label="Expand and collapse">
            <button
              className="outline__action"
              title="Expand all"
              aria-label="Expand all"
              disabled={!levelActionState.canExpand}
              onClick={() => setCollapsed(new Set())}
            >
              <ChevronsUpDown size={13} strokeWidth={1.75} absoluteStrokeWidth />
            </button>
            <button
              className="outline__action"
              title="Expand one level"
              aria-label="Expand one level"
              disabled={!levelActionState.canExpand}
              onClick={() => setCollapsed((c) => expandOneLevel(tree, c))}
            >
              <ChevronDown size={13} strokeWidth={1.75} absoluteStrokeWidth />
            </button>
            <button
              className="outline__action"
              title="Collapse one level"
              aria-label="Collapse one level"
              disabled={!levelActionState.canCollapse}
              onClick={() => setCollapsed((c) => collapseOneLevel(tree, c))}
            >
              <ChevronUp size={13} strokeWidth={1.75} absoluteStrokeWidth />
            </button>
            <button
              className="outline__action"
              title="Collapse all"
              aria-label="Collapse all"
              disabled={!levelActionState.canCollapse}
              onClick={() => setCollapsed(new Set(allParentIds))}
            >
              <ChevronsDownUp size={13} strokeWidth={1.75} absoluteStrokeWidth />
            </button>
          </div>
        )}
      </div>
      <div className="outline__scroll" ref={listRef}>
        {headings.length === 0 ? (
          <div className="outline__empty">No headings</div>
        ) : (
          renderNodes(tree, 0)
        )}
      </div>
      <div className="outline__resizer" onMouseDown={onResizeStart} />
    </aside>
  );
}
