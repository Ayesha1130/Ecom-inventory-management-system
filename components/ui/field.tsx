import type { ComponentProps } from "react";

export function Field({
  label,
  error,
  hint,
  id,
  ...input
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string; id: string }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        {...input}
        className="w-full rounded-lg border border-line bg-raised px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-violet aria-invalid:border-red-400"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
