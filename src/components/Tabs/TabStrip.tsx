import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, FilePlus2, FolderOpen } from 'lucide-react';
import { useTabsStore } from '@/store/tabs';
import { useDocumentStore, isDirty } from '@/store/document';
import { ICON } from '@/components/Toolbar/Toolbar';
import { tabLabels } from '@/lib/tabs';
import './TabStrip.css';

const MENU_ICON = { ...ICON, size: 14 } as const;

export function TabStrip() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const activate = useTabsStore((s) => s.activate);
  const close = useTabsStore((s) => s.close);
  const newTab = useTabsStore((s) => s.newTab);

  const path = useDocumentStore((s) => s.path);
  const hasDocument = useDocumentStore((s) => s.hasDocument);
  const documentDirty = useDocumentStore(isDirty);

  const listRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Build items array with memoization to avoid re-renders on every state change
  const items = useMemo(() => {
    const paths = tabs.map((tab) => {
      if (tab.id === activeId) {
        return path;
      }
      return tab.snapshot?.doc.path ?? null;
    });

    const labels = tabLabels(paths);

    return tabs.map((tab, idx) => {
      const isActive = tab.id === activeId;
      const tabPath = paths[idx];
      const dirty = isActive ? documentDirty : tab.snapshot ? isDirty(tab.snapshot.doc) : false;
      const label = tabPath === null && !hasDocument ? 'New tab' : labels[idx];
      const title = tabPath ?? label;

      return {
        id: tab.id,
        label,
        title,
        dirty,
        active: isActive,
      };
    });
  }, [tabs, activeId, path, hasDocument, documentDirty]);

  // Handle wheel scroll for horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (listRef.current) {
      listRef.current.scrollLeft += e.deltaY;
    }
  };

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!listRef.current) return;

    const activeTabEl = listRef.current.querySelector('[aria-selected="true"]') as HTMLElement;
    if (activeTabEl) {
      activeTabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeId]);

  // Close menu on click outside or Escape key
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        const btn = menuRef.current?.querySelector('.tabstrip__new') as HTMLButtonElement;
        btn?.focus();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Move focus to first menu item when menu opens and handle keyboard navigation
  useEffect(() => {
    if (!menuOpen) return;
    const items = menuRef.current?.querySelectorAll(
      '[role=menuitem]',
    ) as NodeListOf<HTMLButtonElement>;
    if (items.length === 0) return;
    items[0].focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const activeIdx = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);
        const nextIdx =
          e.key === 'ArrowDown'
            ? (activeIdx + 1) % items.length
            : (activeIdx - 1 + items.length) % items.length;
        items[nextIdx].focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, tabId: string) => {
    const currentIdx = items.findIndex((t) => t.id === tabId);
    if (currentIdx < 0) return;

    let nextIdx: number | null = null;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIdx = currentIdx === 0 ? items.length - 1 : currentIdx - 1;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIdx = currentIdx === items.length - 1 ? 0 : currentIdx + 1;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIdx = items.length - 1;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void activate(tabId);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      void close(tabId);
    }

    if (nextIdx !== null) {
      const nextTabId = items[nextIdx].id;
      const nextEl = listRef.current?.querySelector(`[data-tab-id="${nextTabId}"]`) as HTMLElement;
      if (nextEl) {
        nextEl.focus();
      }
    }
  };

  return (
    <div className="tabstrip">
      <div
        className="tabstrip__list"
        role="tablist"
        aria-label="Open documents"
        ref={listRef}
        onWheel={handleWheel}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.active}
            tabIndex={t.active ? 0 : -1}
            data-tab-id={t.id}
            className={`tabstrip__tab${t.active ? ' is-active' : ''}${t.dirty ? ' is-dirty' : ''}`}
            title={t.title}
            onClick={() => void activate(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void close(t.id);
              }
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, t.id)}
          >
            <span className="tabstrip__label">{t.label}</span>
            {t.dirty && (
              <span className="tabstrip__dirty" aria-label="Unsaved changes">
                •
              </span>
            )}
            <button
              className="tabstrip__close"
              aria-label={`Close ${t.label}`}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                void close(t.id);
              }}
            >
              <X size={14} strokeWidth={1.75} absoluteStrokeWidth />
            </button>
          </div>
        ))}
      </div>
      <div className="tabstrip__menu" ref={menuRef}>
        <button
          className={`tabstrip__new${menuOpen ? ' is-active' : ''}`}
          aria-label="New or open"
          title="New or open a file"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Plus {...ICON} />
        </button>
        {menuOpen && (
          <div className="tabstrip__dropdown" role="menu">
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void newTab();
              }}
            >
              <FilePlus2 {...MENU_ICON} /> <span>New file</span> <kbd>Ctrl+T</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void useDocumentStore.getState().openWithDialog();
              }}
            >
              <FolderOpen {...MENU_ICON} /> <span>Open file…</span> <kbd>Ctrl+O</kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
