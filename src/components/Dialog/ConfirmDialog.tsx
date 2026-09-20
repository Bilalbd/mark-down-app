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

  useEffect(() => {
    if (!current) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [current, close]);

  if (!current) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={() => close(null)}>
      <div
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
