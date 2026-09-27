import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import './ConfirmDialog.css';

export interface DialogButton<T extends string = string> {
  id: T;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

interface DialogRequest {
  title: string;
  message: string;
  buttons: DialogButton[];
  resolve: (id: string | null) => void;
}

interface DialogState {
  current: DialogRequest | null;
  show: <T extends string>(
    title: string,
    message: string,
    buttons: DialogButton<T>[],
  ) => Promise<T | null>;
  close: (id: string | null) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  show: (title, message, buttons) =>
    new Promise((resolve) => {
      // A second dialog request while one is open bumps the first one out as
      // cancelled, rather than silently overwriting it and leaking its promise.
      get().current?.resolve(null);
      set({
        current: { title, message, buttons, resolve: resolve as (id: string | null) => void },
      });
    }),
  close: (id) => {
    get().current?.resolve(id);
    set({ current: null });
  },
}));

/** Convenience: Save / Don't save / Cancel. Returns 'save' | 'discard' | null (cancel). */
export function askSaveChanges(fileName: string): Promise<'save' | 'discard' | null> {
  return useDialogStore
    .getState()
    .show(`Save changes to ${fileName}?`, 'Your changes will be lost if you don’t save them.', [
      { id: 'save', label: 'Save', primary: true },
      { id: 'discard', label: 'Don’t save', danger: true },
      { id: 'cancel', label: 'Cancel' },
    ])
    .then((r) => (r === 'cancel' ? null : r));
}

export function ConfirmDialog() {
  const current = useDialogStore((s) => s.current);
  const close = useDialogStore((s) => s.close);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusedBeforeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!current) return;
    focusedBeforeRef.current = document.activeElement as HTMLElement;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.stopImmediatePropagation();
        close(null);
      } else if (e.key === 'Tab') {
        // Read the buttons now: the list differs between dialogs.
        const buttons = Array.from(
          dialogRef.current?.querySelectorAll<HTMLButtonElement>('.dialog__btn') ?? [],
        );
        if (buttons.length === 0) return;
        const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.shiftKey) {
          // Shift+Tab from the first button goes to the last
          if (currentIndex === 0 || currentIndex === -1) {
            e.preventDefault();
            buttons[buttons.length - 1].focus();
          }
        } else {
          // Tab from the last button goes to the first
          if (currentIndex === buttons.length - 1) {
            e.preventDefault();
            buttons[0].focus();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      // Restore focus when dialog closes
      if (focusedBeforeRef.current && focusedBeforeRef.current.isConnected) {
        focusedBeforeRef.current.focus();
      }
    };
  }, [current, close]);

  if (!current) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={() => close(null)}>
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title" id="dialog-title">
          {current.title}
        </h2>
        <p className="dialog__message">{current.message}</p>
        <div className="dialog__buttons">
          {current.buttons.map((b) => (
            <button
              key={b.id}
              ref={b.primary ? primaryRef : undefined}
              className={`dialog__btn ${b.primary ? 'is-primary' : ''} ${b.danger ? 'is-danger' : ''}`}
              onClick={() => close(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
