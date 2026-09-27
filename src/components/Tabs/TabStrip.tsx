import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, FilePlus2, FolderOpen, History, ChevronRight } from 'lucide-react';
import { useTabsStore, openPath } from '@/store/tabs';
import { useDocumentStore, isDirty } from '@/store/document';
import { useSettingsStore } from '@/store/settings';
import { ICON } from '@/components/Toolbar/Toolbar';
import { basename, dirname } from '@/lib/tauri';
import { tabLabels, flyoutSide, shortDir, dropIndex } from '@/lib/tabs';
import { TabContextMenu } from './TabContextMenu';
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
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const submenuRef = useRef<HTMLDivElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [flyoutIsLeft, setFlyoutIsLeft] = useState(false);

  const recentFiles = useSettingsStore((s) => s.recentFiles);

  // Dragging state
  const [dragState, setDragState] = useState<{
    tabId: string;
    startX: number;
    currentX: number;
    midpoints: number[];
    isDragging: boolean;
  } | null>(null);
  const dragClickSuppressRef = useRef(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);

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
        path: tabPath,
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

  // Close menu on click outside or Escape key, close flyout when menu closes, cancel drag on Escape
  useEffect(() => {
    if (!menuOpen && !dragState) {
      setFlyoutOpen(false);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (dragState) {
          setDragState(null);
        } else if (flyoutOpen) {
          setFlyoutOpen(false);
        } else if (menuOpen) {
          setMenuOpen(false);
          const btn = menuRef.current?.querySelector('.tabstrip__new') as HTMLButtonElement;
          btn?.focus();
        }
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, flyoutOpen, dragState]);

  // Close flyout when clicking outside or on specific flyout actions, and cleanup timeouts
  useEffect(() => {
    if (!flyoutOpen) return;

    const onDown = (e: MouseEvent) => {
      if (!submenuRef.current?.contains(e.target as Node)) {
        setFlyoutOpen(false);
      }
    };

    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
      // Clear any pending leave timeout
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, [flyoutOpen]);

  // Measure and adjust flyout position after it renders
  useLayoutEffect(() => {
    if (!flyoutOpen || !flyoutRef.current) return;

    const menuRect = submenuRef.current!.getBoundingClientRect();
    const flyoutWidth = flyoutRef.current.offsetWidth;
    const isLeft = flyoutSide(menuRect.right, flyoutWidth, window.innerWidth) === 'left';
    setFlyoutIsLeft(isLeft);
  }, [flyoutOpen]);

  // Adjust flyout position on window resize
  useEffect(() => {
    if (!flyoutOpen || !submenuRef.current) return;

    const updatePosition = () => {
      if (!flyoutRef.current) return;
      const rect = submenuRef.current!.getBoundingClientRect();
      const flyoutWidth = flyoutRef.current.offsetWidth;
      const isLeft = flyoutSide(rect.right, flyoutWidth, window.innerWidth) === 'left';
      setFlyoutIsLeft(isLeft);
    };

    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [flyoutOpen]);

  // Move focus to first menu item when menu opens and handle keyboard navigation
  useEffect(() => {
    if (!menuOpen) return;
    const items = menuRef.current?.querySelectorAll(
      '[role=menuitem]',
    ) as NodeListOf<HTMLButtonElement>;
    if (items.length === 0) return;
    items[0].focus();

    const onKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLButtonElement;
      const openRecentBtn = menuRef.current?.querySelector('[data-menu-item="recent"]') as
        HTMLButtonElement | undefined;
      const isOpenRecentBtn = activeEl === openRecentBtn;
      const flyoutItems = flyoutRef.current?.querySelectorAll('[role=menuitem]') as
        NodeListOf<HTMLButtonElement> | undefined;

      if (isOpenRecentBtn && (e.key === 'ArrowRight' || e.key === 'Enter')) {
        e.preventDefault();
        setFlyoutOpen(true);
        // Focus first flyout item after a microtask
        setTimeout(() => {
          const firstFlyoutItem = flyoutRef.current?.querySelector(
            '[role=menuitem]',
          ) as HTMLButtonElement;
          firstFlyoutItem?.focus();
        }, 0);
      } else if (flyoutOpen && flyoutItems && flyoutItems.length > 0) {
        const flyoutIdx = Array.from(flyoutItems).indexOf(activeEl);
        if (flyoutIdx >= 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIdx = (flyoutIdx + 1) % flyoutItems.length;
            flyoutItems[nextIdx].focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const nextIdx = (flyoutIdx - 1 + flyoutItems.length) % flyoutItems.length;
            flyoutItems[nextIdx].focus();
          } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
            e.preventDefault();
            setFlyoutOpen(false);
            openRecentBtn?.focus();
          }
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const activeIdx = Array.from(items).indexOf(activeEl);
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
  }, [menuOpen, flyoutOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, tabId: string) => {
    const currentIdx = items.findIndex((t) => t.id === tabId);
    if (currentIdx < 0) return;

    let nextIdx: number | null = null;

    if (e.key === 'ArrowLeft') {
      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (currentIdx > 0) {
          useTabsStore.getState().move(currentIdx, currentIdx - 1);
        }
        return;
      }
      e.preventDefault();
      nextIdx = currentIdx === 0 ? items.length - 1 : currentIdx - 1;
    } else if (e.key === 'ArrowRight') {
      if (e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (currentIdx < items.length - 1) {
          useTabsStore.getState().move(currentIdx, currentIdx + 1);
        }
        return;
      }
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
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const el = listRef.current?.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement;
      if (el) {
        const rect = el.getBoundingClientRect();
        setContextMenu({
          tabId,
          x: rect.left,
          y: rect.bottom,
        });
      }
    }

    if (nextIdx !== null) {
      const nextTabId = items[nextIdx].id;
      const nextEl = listRef.current?.querySelector(`[data-tab-id="${nextTabId}"]`) as HTMLElement;
      if (nextEl) {
        nextEl.focus();
      }
    }
  };

  // Find the index of the active tab
  const activeTabIndex = items.findIndex((t) => t.active);

  // Handle mouse enter/leave for flyout with delay
  const handleSubmenuMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }
    setFlyoutOpen(true);
  };

  const handleSubmenuMouseLeave = () => {
    leaveTimeoutRef.current = setTimeout(() => {
      setFlyoutOpen(false);
    }, 150);
  };

  const handleOpenRecentClick = () => {
    setFlyoutOpen((v) => !v);
  };

  const handleRecentFileClick = (path: string) => {
    setMenuOpen(false);
    setFlyoutOpen(false);
    void openPath(path);
  };

  const handleClearRecentFiles = () => {
    useSettingsStore.getState().clearRecentFiles();
    setMenuOpen(false);
    setFlyoutOpen(false);
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
        {items.map((t, idx) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.active}
            tabIndex={t.active ? 0 : -1}
            data-tab-id={t.id}
            className={`tabstrip__tab${t.active ? ' is-active' : ''}${t.dirty ? ' is-dirty' : ''}${idx === activeTabIndex - 1 ? ' is-before-active' : ''}${dragState?.tabId === t.id && dragState.isDragging ? ' is-dragging' : ''}`}
            title={t.title}
            style={
              dragState?.tabId === t.id && dragState.isDragging
                ? { transform: `translateX(${dragState.currentX - dragState.startX}px)` }
                : undefined
            }
            onClick={(_e) => {
              if (dragClickSuppressRef.current) {
                dragClickSuppressRef.current = false;
                return;
              }
              void activate(t.id);
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const closeBtn = (e.target as HTMLElement).closest('.tabstrip__close');
              if (closeBtn) return;

              const midpoints = Array.from(
                listRef.current?.querySelectorAll('[data-tab-id]') || [],
              ).map((el) => {
                const r = el.getBoundingClientRect();
                return r.left + r.width / 2;
              });

              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDragState({
                tabId: t.id,
                startX: e.clientX,
                currentX: e.clientX,
                midpoints,
                isDragging: false,
              });
            }}
            onPointerMove={(e) => {
              if (!dragState || dragState.tabId !== t.id) return;

              const dx = e.clientX - dragState.startX;
              if (!dragState.isDragging && Math.abs(dx) > 4) {
                dragClickSuppressRef.current = true;
              }

              setDragState((prev) => {
                if (!prev || prev.tabId !== t.id) return prev;
                return {
                  ...prev,
                  currentX: e.clientX,
                  isDragging: Math.abs(dx) > 4,
                };
              });
            }}
            onPointerUp={(e) => {
              if (!dragState || dragState.tabId !== t.id) return;

              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

              if (dragState.isDragging) {
                const targetIdx = dropIndex(dragState.midpoints, idx, e.clientX);
                if (targetIdx !== idx) {
                  useTabsStore.getState().move(idx, targetIdx);
                }
              }

              setDragState(null);
            }}
            onPointerCancel={(e) => {
              if (!dragState || dragState.tabId !== t.id) return;
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              setDragState(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                tabId: t.id,
                x: e.clientX,
                y: e.clientY,
              });
            }}
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
            <div
              className="tabstrip__submenu"
              ref={submenuRef}
              onMouseEnter={handleSubmenuMouseEnter}
              onMouseLeave={handleSubmenuMouseLeave}
            >
              <button
                role="menuitem"
                data-menu-item="recent"
                aria-haspopup="menu"
                aria-expanded={flyoutOpen}
                onClick={handleOpenRecentClick}
              >
                <History {...MENU_ICON} /> <span>Open recent</span> <ChevronRight {...MENU_ICON} />
              </button>
              {flyoutOpen && (
                <div
                  ref={flyoutRef}
                  className={`tabstrip__dropdown tabstrip__flyout${flyoutIsLeft ? ' is-left' : ''}`}
                  role="menu"
                  aria-label="Recent files"
                >
                  {recentFiles.length === 0 ? (
                    <div className="tabstrip__empty">No recent files</div>
                  ) : (
                    <>
                      {recentFiles.map((p) => (
                        <button
                          key={p}
                          role="menuitem"
                          title={p}
                          onClick={() => void handleRecentFileClick(p)}
                        >
                          <span className="tabstrip__recent-name">{basename(p)}</span>
                          <span className="tabstrip__recent-dir">{shortDir(dirname(p))}</span>
                        </button>
                      ))}
                      <div role="separator" className="tabstrip__separator" />
                      <button role="menuitem" onClick={handleClearRecentFiles}>
                        Clear recent files
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {contextMenu && (
        <TabContextMenu
          tabId={contextMenu.tabId}
          tabPath={items.find((t) => t.id === contextMenu.tabId)?.path ?? null}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
