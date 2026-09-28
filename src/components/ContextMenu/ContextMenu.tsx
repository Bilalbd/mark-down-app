import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { flyoutSide, menuPosition } from '@/lib/tabs';
import './ContextMenu.css';

const MENU_ICON = { size: 14, strokeWidth: 1.75, absoluteStrokeWidth: true } as const;

/** How long the mouse can rest on a plain item before a still-open submenu closes. Mirrors the
 * tab strip's "Open recent" flyout so both menus feel the same. */
const SUBMENU_CLOSE_DELAY_MS = 150;

export interface MenuItemData {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Shown right-aligned, e.g. "Ctrl+B". Purely visual - see `ariaKeyShortcuts`. */
  shortcut?: string;
  /** `aria-keyshortcuts` value, e.g. "Control+B". */
  ariaKeyShortcuts?: string;
  disabled?: boolean;
  /** Bold label - used for the top spelling suggestion. */
  bold?: boolean;
  submenu?: MenuEntry[];
}

export interface MenuSeparator {
  id: string;
  separator: true;
}

export type MenuEntry = MenuItemData | MenuSeparator;

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'separator' in entry && entry.separator === true;
}

/** Finds an item by id, including inside submenus. */
export function findMenuItem(items: readonly MenuEntry[], id: string): MenuItemData | undefined {
  for (const entry of items) {
    if (isSeparator(entry)) continue;
    if (entry.id === id) return entry;
    if (entry.submenu) {
      const found = findMenuItem(entry.submenu, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Why the menu closed - `onClose` gets this so a caller can decide whether to reclaim focus.
 * `'escape'` is the only case that should move focus back to whatever opened the menu: for
 * `'outside'` the pointer (or focus) already went somewhere else, and for `'action'` the item's
 * own handler is responsible for where focus ends up. */
export type MenuCloseReason = 'escape' | 'outside' | 'action';

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onAction: (id: string) => void;
  onClose: (reason: MenuCloseReason) => void;
  ariaLabel?: string;
}

/** A generic, data-driven right-click / keyboard-invoked menu: items with a label, icon,
 * shortcut text, disabled and bold flags, one level of submenu, and separators. Rendered in a
 * portal so it's never clipped by a scrolling ancestor, and styled with `--chrome-*` tokens to
 * match `TabContextMenu`. */
export function ContextMenu({ x, y, items, onAction, onClose, ariaLabel }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [submenuPos, setSubmenuPos] = useState({ left: 0, top: 0 });
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelSubmenuClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  };

  // Measure and clamp the root menu's position, then focus its first enabled item.
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const width = menuRef.current.offsetWidth;
    const height = menuRef.current.offsetHeight;
    setPos(menuPosition(x, y, width, height, window.innerWidth, window.innerHeight));
    menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [x, y]);

  // Measure and clamp the submenu's position against its trigger item.
  useLayoutEffect(() => {
    if (!openSubmenu || !submenuRef.current) return;
    const trigger = menuRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${CSS.escape(openSubmenu)}"]`,
    );
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = submenuRef.current.offsetWidth;
    const height = submenuRef.current.offsetHeight;
    const side = flyoutSide(rect.right, width, window.innerWidth);
    const left = side === 'right' ? rect.right : Math.max(0, rect.left - width);
    const top = Math.max(0, Math.min(rect.top, window.innerHeight - height - 4));
    setSubmenuPos({ left, top });
  }, [openSubmenu]);

  // Outside mousedown, window blur, scroll or resize all close the whole menu. None of these
  // steal focus back - the pointer (or focus) already went wherever it's going.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || submenuRef.current?.contains(target)) return;
      onClose('outside');
    };
    const onWindowClose = () => onClose('outside');
    window.addEventListener('mousedown', onDown);
    window.addEventListener('blur', onWindowClose);
    window.addEventListener('scroll', onWindowClose, true);
    window.addEventListener('resize', onWindowClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('blur', onWindowClose);
      window.removeEventListener('scroll', onWindowClose, true);
      window.removeEventListener('resize', onWindowClose);
    };
  }, [onClose]);

  useEffect(() => cancelSubmenuClose, []);

  const focusables = (root: HTMLElement | null): HTMLButtonElement[] =>
    root
      ? Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
      : [];

  const moveFocus = (root: HTMLElement | null, dir: 1 | -1) => {
    const items = focusables(root);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      idx < 0 ? (dir === 1 ? 0 : items.length - 1) : (idx + dir + items.length) % items.length;
    items[next].focus();
  };

  const focusEdge = (root: HTMLElement | null, edge: 'first' | 'last') => {
    const items = focusables(root);
    if (items.length === 0) return;
    (edge === 'first' ? items[0] : items[items.length - 1]).focus();
  };

  // Keyboard navigation: handled on window so it works no matter which item has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose('escape');
        return;
      }

      const inSubmenu =
        openSubmenu !== null && !!submenuRef.current?.contains(document.activeElement);
      if (inSubmenu) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          moveFocus(submenuRef.current, 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          moveFocus(submenuRef.current, -1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          focusEdge(submenuRef.current, 'first');
        } else if (e.key === 'End') {
          e.preventDefault();
          focusEdge(submenuRef.current, 'last');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const triggerId = openSubmenu;
          setOpenSubmenu(null);
          menuRef.current
            ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(triggerId)}"]`)
            ?.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const id = (document.activeElement as HTMLElement)?.dataset.itemId;
          if (id) {
            onAction(id);
            onClose('action');
          }
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(menuRef.current, 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(menuRef.current, -1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        focusEdge(menuRef.current, 'first');
      } else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        const id = (document.activeElement as HTMLElement)?.dataset.itemId;
        const item = id ? findMenuItem(items, id) : undefined;
        if (!item) return;
        e.preventDefault();
        if (item.submenu) {
          setOpenSubmenu(item.id);
          setTimeout(() => focusEdge(submenuRef.current, 'first'), 0);
        } else if (e.key !== 'ArrowRight') {
          onAction(item.id);
          onClose('action');
        }
      } else if (e.key === 'End') {
        e.preventDefault();
        focusEdge(menuRef.current, 'last');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, openSubmenu, onAction, onClose]);

  const renderItem = (entry: MenuEntry) => {
    if (isSeparator(entry)) {
      return <div key={entry.id} role="separator" className="context-menu__separator" />;
    }
    const Icon = entry.icon;
    const hasSubmenu = !!entry.submenu;
    return (
      <button
        key={entry.id}
        type="button"
        role="menuitem"
        data-item-id={entry.id}
        disabled={entry.disabled}
        className={`context-menu__item${entry.bold ? ' is-bold' : ''}`}
        aria-haspopup={hasSubmenu ? 'menu' : undefined}
        aria-expanded={hasSubmenu ? openSubmenu === entry.id : undefined}
        aria-keyshortcuts={entry.ariaKeyShortcuts}
        onMouseEnter={() => {
          cancelSubmenuClose();
          if (hasSubmenu) setOpenSubmenu(entry.id);
          else if (openSubmenu)
            closeTimerRef.current = setTimeout(() => setOpenSubmenu(null), SUBMENU_CLOSE_DELAY_MS);
        }}
        onClick={() => {
          if (hasSubmenu) {
            setOpenSubmenu((cur) => (cur === entry.id ? null : entry.id));
            return;
          }
          onAction(entry.id);
          onClose('action');
        }}
      >
        {Icon && <Icon {...MENU_ICON} />}
        <span>{entry.label}</span>
        {hasSubmenu && <ChevronRight {...MENU_ICON} />}
        {entry.shortcut && <kbd aria-hidden="true">{entry.shortcut}</kbd>}
      </button>
    );
  };

  const openItem = openSubmenu ? findMenuItem(items, openSubmenu) : undefined;

  return createPortal(
    <>
      <div
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        className="context-menu"
        style={{ left: pos.left, top: pos.top }}
      >
        {items.map(renderItem)}
      </div>
      {openItem?.submenu && (
        <div
          ref={submenuRef}
          role="menu"
          aria-label={openItem.label}
          className="context-menu context-menu--submenu"
          style={{ left: submenuPos.left, top: submenuPos.top }}
          onMouseEnter={cancelSubmenuClose}
          onMouseLeave={() => {
            closeTimerRef.current = setTimeout(() => setOpenSubmenu(null), SUBMENU_CLOSE_DELAY_MS);
          }}
        >
          {openItem.submenu.map(renderItem)}
        </div>
      )}
    </>,
    document.body,
  );
}
