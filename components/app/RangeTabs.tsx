import Link from "next/link";

export const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangeKey = keyof typeof RANGES;

export function RangeTabs({ slug, active, path = "" }: { slug: string; active: RangeKey; path?: string }) {
  return (
    <nav aria-label="Date range" className="flex rounded-full border border-line bg-surface p-1 text-sm">
      {(Object.keys(RANGES) as RangeKey[]).map((key) => (
        <Link
          key={key}
          href={`/o/${slug}${path}?range=${key}`}
          aria-current={key === active ? "page" : undefined}
          className={`rounded-full px-3.5 py-1 transition-colors ${
            key === active ? "bg-white/10 text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {key === "7d" ? "7 days" : key === "30d" ? "30 days" : "90 days"}
        </Link>
      ))}
    </nav>
  );
}
