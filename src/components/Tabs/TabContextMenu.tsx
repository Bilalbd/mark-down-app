import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRightToLine, Copy, FolderOpen, SquareX, X } from 'lucide-react';
import { useTabsStore } from '@/store/tabs';
import { menuPosition } from '@/lib/tabs';
import { revealInExplorer } from '@/lib/tauri';
import { ICON } from '@/components/Toolbar/Toolbar';

const MENU_ICON = { ...ICON, size: 14 } as const;

export interface TabContextMenuProps {
  tabId: string;
  tabPath: string | null;
  x: number;
  y: number;
  onClose: () => void;
}

export function TabContextMenu({ tabId, tabPath, x, y, onClose }: TabContextMenuProps) {
  const closeTab = useTabsStore((s) => s.close);
  const closeOthers = useTabsStore((s) => s.closeOthers);
  const closeToRight = useTabsStore((s) => s.closeToRight);
  const tabs = useTabsStore((s) => s.tabs);

  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ left: x, top: y });
  const firstItemRef = useRef<HTMLButtonElement>(null);

  // Find tab's position in the tabs array
  const tabIndex = tabs.findIndex((t) => t.id === tabId);
  const isLastTab = tabIndex === tabs.length - 1;
  const isSingleTab = tabs.length === 1;

  // Measure and adjust menu position after it renders
  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const menuWidth = menuRef.current.offsetWidth;
    const menuHeight = menuRef.current.offsetHeight;
    const pos = menuPosition(x, y, menuWidth, menuHeight, window.innerWidth, window.innerHeight);
    setMenuPos(pos);

    // Focus first enabled item
    setTimeout(() => {
      firstItemRef.current?.focus();
    }, 0);
  }, [x, y]);

  // Handle keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const items = Array.from(
        menuRef.current?.querySelectorAll('[role="menuitem"]') || [],
      ) as HTMLButtonElement[];
      if (items.length === 0) return;

      const activeEl = document.activeElement as HTMLButtonElement;
      const activeIdx = items.indexOf(activeEl);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIdx = activeIdx < 0 ? 0 : activeIdx + 1;
        while (nextIdx < items.length && items[nextIdx].disabled) {
          nextIdx += 1;
        }
        if (nextIdx < items.length) {
          items[nextIdx].focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        let nextIdx = activeIdx < 0 ? items.length - 1 : activeIdx - 1;
        while (nextIdx >= 0 && items[nextIdx].disabled) {
          nextIdx -= 1;
        }
        if (nextIdx >= 0) {
          items[nextIdx].focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        document.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(tabId)}"]`)?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, tabId]);

  // Close menu on click outside
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  // Close menu on window blur or scroll
  useEffect(() => {
    const onBlur = () => {
      onClose();
    };

    const onScroll = () => {
      onClose();
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const handleAction = async (action: () => Promise<boolean | void>) => {
    onClose();
    await action();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="tabstrip__dropdown tabstrip__context"
      style={{ left: menuPos.left, top: menuPos.top }}
    >
      <button
        ref={firstItemRef}
        role="menuitem"
        onClick={() => void handleAction(() => closeTab(tabId))}
      >
        <X {...MENU_ICON} /> <span>Close</span>
      </button>
      <button
        role="menuitem"
        disabled={isSingleTab}
        onClick={() => void handleAction(() => closeOthers(tabId))}
      >
        <SquareX {...MENU_ICON} /> <span>Close others</span>
      </button>
      <button
        role="menuitem"
        disabled={isLastTab}
        onClick={() => void handleAction(() => closeToRight(tabId))}
      >
        <ArrowRightToLine {...MENU_ICON} /> <span>Close to the right</span>
      </button>
      <div role="separator" className="tabstrip__separator" />
      <button
        role="menuitem"
        disabled={tabPath === null}
        onClick={() =>
          void handleAction(async () => {
            if (tabPath) {
              await navigator.clipboard.writeText(tabPath).catch(() => undefined);
            }
          })
        }
      >
        <Copy {...MENU_ICON} /> <span>Copy path</span>
      </button>
      <button
        role="menuitem"
        disabled={tabPath === null}
        onClick={() =>
          void handleAction(async () => {
            if (tabPath) {
              await revealInExplorer(tabPath).catch(() => undefined);
            }
          })
        }
      >
        <FolderOpen {...MENU_ICON} /> <span>Reveal in File Explorer</span>
      </button>
    </div>
  );
}
