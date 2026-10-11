import Link from "next/link";
import { requireStore } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { listingSchema } from "@/lib/validators/storefront";
import { ProductCard } from "@/components/store/ProductCard";

export default async function StoreHome({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const info = await requireStore(storeSlug);
  const { data } = await createPublicClient().rpc("storefront_products", { p_store: storeSlug, p_sort: "new", p_limit: 8, p_offset: 0 });
  const list = listingSchema.parse(data ?? { total: 0, rows: [] });
  const base = `/s/${storeSlug}`;

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-16 md:pt-24">
        <h1 className="max-w-3xl font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.98] tracking-[-0.03em]">
          {info.tagline ?? `Welcome to ${info.name}`}
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`${base}/products`} className="rounded-full bg-violet px-7 py-3 text-sm font-medium text-white">Shop all</Link>
          {info.categories[0] && (
            <Link href={`${base}/c/${info.categories[0].slug}`} className="rounded-full border border-line px-7 py-3 text-sm hover:bg-fg/5">
              {info.categories[0].name}
            </Link>
          )}
        </div>
      </section>

      {info.categories.length > 0 && (
        <section aria-label="Categories" className="mx-auto max-w-6xl px-5">
          <ul className="grid gap-4 sm:grid-cols-3">
            {info.categories.map((c) => (
              <li key={c.slug}>
                <Link href={`${base}/c/${c.slug}`} className="flex h-36 flex-col justify-between rounded-xl bg-raised p-5 transition-colors hover:bg-line">
                  <span className="font-display text-3xl">{c.name}</span>
                  <span className="text-sm text-muted">{c.count} product{c.count === 1 ? "" : "s"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto mt-20 max-w-6xl px-5" aria-labelledby="new-h">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="new-h" className="font-display text-4xl">New arrivals</h2>
          <Link href={`${base}/products`} className="text-sm underline">View all</Link>
        </div>
        {list.rows.length === 0 ? (
          <p className="py-16 text-center text-muted">Products are on their way. Check back soon.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {list.rows.map((p) => <ProductCard key={p.id} p={p} slug={storeSlug} currency={info.currency} />)}
          </ul>
        )}
      </section>
    </>
  );
}
