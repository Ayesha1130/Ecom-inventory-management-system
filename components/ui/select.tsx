import type { ComponentProps } from "react";

export function SelectField({ label, id, error, children, ...props }: ComponentProps<"select"> & { label: string; id: string; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm">{label}</label>
      <select
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
        className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-sm outline-none focus:border-violet aria-invalid:border-red-400"
      >
        {children}
      </select>
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-300">{error}</p>}
    </div>
  );
}
