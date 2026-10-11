import type { ComponentProps } from "react";

const variants = {
  primary: "bg-violet text-white hover:bg-violet/90",
  ghost: "border border-line bg-white/4 hover:bg-white/8",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    />
  );
}
