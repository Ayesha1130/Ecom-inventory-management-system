"use client";
import { useEffect, useRef } from "react";

/** Native <dialog>: the browser provides the focus trap, Escape to close, and inert background. */
export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[14px] border border-line bg-surface p-0 text-fg backdrop:bg-black/60"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="font-display text-2xl leading-tight">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-muted hover:text-fg">✕</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
