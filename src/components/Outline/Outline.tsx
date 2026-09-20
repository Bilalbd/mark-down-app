import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HeadingInfo } from '@/markdown/plugins';
import { useSettingsStore } from '@/store/settings';
import { useViewStore } from '@/store/view';
import './Outline.css';

interface Node extends HeadingInfo {
  children: Node[];
}

/** Builds a tree from the flat heading list; deeper levels nest under the nearest shallower one. */
export function buildTree(headings: HeadingInfo[]): Node[] {
  const root: Node[] = [];
  const stack: Node[] = [];
  for (const h of headings) {
    const node: Node = { ...h, children: [] };
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

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

export function Outline() {
  const headings = useViewStore((s) => s.headings);
  const topLine = useViewStore((s) => s.topLine);
  const requestScrollToLine = useViewStore((s) => s.requestScrollToLine);
  const width = useSettingsStore((s) => s.outlineWidth);
  const set = useSettingsStore((s) => s.set);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const tree = useMemo(() => buildTree(headings), [headings]);
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

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      set('outlineWidth', Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + ev.clientX - startX)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderNodes = (nodes: Node[], depth: number) => (
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
              onClick={() => requestScrollToLine(n.line)}
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
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path
                    d={isCollapsed ? 'M3 1l4 4-4 4' : 'M1 3l4 4 4-4'}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
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
      <div className="outline__header">Outline</div>
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
