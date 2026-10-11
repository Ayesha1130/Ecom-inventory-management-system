import { readableOn, swatchColor } from "@/lib/colors";

/**
 * Typographic placeholder shown when a product has no photo yet. It is deliberately not a fake photo:
 * real stores upload images (Phase 4); the tile takes its color from the product's own color option.
 */
export function ProductArt({ name, color, className = "" }: { name: string; color?: string | null; className?: string }) {
  const bg = swatchColor(color);
  return (
    <div
      aria-hidden
      className={`grid place-items-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(160deg, ${bg}, color-mix(in srgb, ${bg} 80%, black))`, color: readableOn(bg) }}
    >
      <span className="font-display text-[clamp(4rem,12vw,7rem)] leading-none opacity-90">{name.trim()[0]?.toUpperCase()}</span>
    </div>
  );
}
