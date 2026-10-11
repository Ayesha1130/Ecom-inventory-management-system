import Link from "next/link";
import { buildHref } from "@/lib/query";

export function Pagination({ basePath, params, page, pageSize, total }: {
  basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const link = (n: number) => buildHref(basePath, { ...params, page: n > 1 ? String(n) : undefined });
  const cls = "rounded-full border border-line px-3 py-1.5 text-sm hover:bg-fg/5";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 pt-4 text-sm text-muted">
      <p>{total === 0 ? "No results" : `${from}–${to} of ${total.toLocaleString("en-US")}`}</p>
      {pages > 1 && (
        <div className="flex gap-2">
          {page > 1 ? <Link href={link(page - 1)} rel="prev" className={cls}>Previous</Link> : <span className={`${cls} opacity-40`} aria-disabled="true">Previous</span>}
          {page < pages ? <Link href={link(page + 1)} rel="next" className={cls}>Next</Link> : <span className={`${cls} opacity-40`} aria-disabled="true">Next</span>}
        </div>
      )}
    </nav>
  );
}
