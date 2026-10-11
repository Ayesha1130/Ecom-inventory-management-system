import Link from "next/link";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/app/Pagination";
import { parsePage } from "@/lib/query";
import { createPublicClient } from "@/lib/supabase/public";
import { listingSchema, type StoreInfo } from "@/lib/validators/storefront";
import { ProductCard } from "./ProductCard";

const PAGE_SIZE = 12;
const SORTS = { new: "Newest", price_asc: "Price, low to high", price_desc: "Price, high to low", name: "Name" } as const;
type SortKey = keyof typeof SORTS;

export async function ProductListing({ slug, info, category, sp, basePath }: {
  slug: string; info: StoreInfo; category?: string; sp: Record<string, string | undefined>; basePath: string;
}) {
  const current = category ? info.categories.find((c) => c.slug === category) : undefined;
  if (category && !current) notFound();
  const q = (sp.q ?? "").slice(0, 80);
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : "new";
  const page = parsePage(sp.page);

  const { data, error } = await createPublicClient().rpc("storefront_products", {
    p_store: slug, p_category: category ?? null, p_search: q || null, p_sort: sort,
    p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error("Couldn't load products.");
  const list = listingSchema.parse(data);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="font-display text-5xl tracking-tight">{current?.name ?? (q ? `Results for “${q}”` : "All products")}</h1>
      <nav aria-label="Categories" className="mt-5 flex flex-wrap gap-2 text-sm">
        <Link href={`/s/${slug}/products`} aria-current={!category ? "page" : undefined}
          className={`rounded-full border border-line px-4 py-1.5 ${!category ? "bg-fg text-bg" : "hover:bg-fg/5"}`}>All</Link>
        {info.categories.map((c) => (
          <Link key={c.slug} href={`/s/${slug}/c/${c.slug}`} aria-current={c.slug === category ? "page" : undefined}
            className={`rounded-full border border-line px-4 py-1.5 ${c.slug === category ? "bg-fg text-bg" : "hover:bg-fg/5"}`}>{c.name}</Link>
        ))}
      </nav>

      <form method="get" action={basePath} className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q" className="mb-1 block text-sm">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search products" className="w-64 rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="sort" className="mb-1 block text-sm">Sort by</label>
          <select id="sort" name="sort" defaultValue={sort} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            {(Object.keys(SORTS) as SortKey[]).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}
          </select>
        </div>
        <button className="rounded-full border border-line px-5 py-2 text-sm hover:bg-fg/5">Apply</button>
      </form>

      {list.rows.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-display text-3xl">Nothing found.</p>
          <p className="mt-2 text-sm text-muted">Try a different search, or <Link href={`/s/${slug}/products`} className="underline">browse everything</Link>.</p>
        </div>
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {list.rows.map((p) => <ProductCard key={p.id} p={p} slug={slug} currency={info.currency} />)}
          </ul>
          <Pagination basePath={basePath} params={{ q, sort: sort === "new" ? undefined : sort }} page={page} pageSize={PAGE_SIZE} total={list.total} />
        </>
      )}
    </div>
  );
}
