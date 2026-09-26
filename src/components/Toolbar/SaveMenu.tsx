import { useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { useDocumentStore } from '@/store/document';
import { ICON } from './Toolbar';

export function SaveMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const hasDocument = useDocumentStore((s) => s.hasDocument);
  const save = useDocumentStore((s) => s.save);
  const saveAs = useDocumentStore((s) => s.saveAs);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const items = ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
        if (items && items.length > 0) {
          const currentIdx = Array.from(items).findIndex((el) => el === document.activeElement);
          items[(currentIdx + 1) % items.length]?.focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const items = ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
        if (items && items.length > 0) {
          const currentIdx = Array.from(items).findIndex((el) => el === document.activeElement);
          items[(currentIdx - 1 + items.length) % items.length]?.focus();
        }
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && firstItemRef.current) {
      firstItemRef.current.focus();
    }
  }, [open]);

  const handleSave = async () => {
    setOpen(false);
    await save();
  };

  const handleSaveAs = async () => {
    setOpen(false);
    await saveAs();
  };

  return (
    <div className="toolbar__menu" ref={ref}>
      <button
        ref={buttonRef}
        className={`toolbar__btn ${open ? 'is-active' : ''}`}
        title="Save"
        aria-label="Save"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!hasDocument}
        onClick={() => setOpen((v) => !v)}
      >
        <Save {...ICON} />
      </button>
      {open && (
        <div className="toolbar__dropdown" role="menu">
          <button
            ref={firstItemRef}
            role="menuitem"
            onClick={() => void handleSave()}
            className="toolbar__menu-item"
          >
            <span>Save</span>
            <kbd>Ctrl+S</kbd>
          </button>
          <button
            role="menuitem"
            onClick={() => void handleSaveAs()}
            className="toolbar__menu-item"
          >
            <span>Save as…</span>
            <kbd>Ctrl+Shift+S</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
