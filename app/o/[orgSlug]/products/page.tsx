import Link from "next/link";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { parsePage } from "@/lib/query";
import { productListSchema } from "@/lib/validators/catalog";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pagination } from "@/components/app/Pagination";
import { ProductFilters, SORTS, type SortKey } from "@/components/app/products/ProductFilters";
import { ProductTable } from "@/components/app/products/ProductTable";

const PAGE_SIZE = 20;
const STATUSES = ["draft", "active", "archived"] as const;

export default async function ProductsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const canWrite = hasRole(role, "manager");

  const q = (sp.q ?? "").slice(0, 100);
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const category = /^[0-9a-f-]{36}$/i.test(sp.category ?? "") ? sp.category! : "";
  const sort: SortKey = sp.sort && sp.sort in SORTS ? (sp.sort as SortKey) : "newest";
  const page = parsePage(sp.page);

  const [list, cats] = await Promise.all([
    supabase.rpc("list_products", {
      p_org: org.id, p_search: q || null, p_status: status, p_category: category || null,
      p_sort: SORTS[sort][0], p_dir: SORTS[sort][1], p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.from("categories").select("id, name").eq("organization_id", org.id).order("name"),
  ]);
  if (list.error) throw new Error("Couldn't load products.");
  const data = productListSchema.parse(list.data);
  const filtered = !!(q || status || category);
  const basePath = `/o/${org.slug}/products`;
  const params2 = { q, status: status ?? undefined, category, sort: sort === "newest" ? undefined : sort };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Products</h1>
          <p className="mt-1 text-sm text-muted">{data.total.toLocaleString("en-US")} {filtered ? "matching" : "total"}</p>
        </div>
        {canWrite && <Link href={`${basePath}/new`} className="rounded-full bg-violet px-5 py-2.5 text-sm font-medium">Add product</Link>}
      </div>
      <ProductFilters q={q} status={status ?? ""} category={category} sort={sort} categories={cats.data ?? []} />
      {data.rows.length === 0 ? (
        <Card title="Catalog">
          {filtered ? (
            <EmptyState title="No products match" body="Try a different search or clear the filters." />
          ) : (
            <EmptyState title="No products yet" body={canWrite ? "Add your first product to start selling." : "Products will appear here."} />
          )}
          {filtered && <p className="text-center"><Link href={basePath} className="text-sm underline">Clear filters</Link></p>}
        </Card>
      ) : (
        <>
          <ProductTable rows={data.rows} slug={org.slug} canWrite={canWrite} currency={org.currency} />
          <Pagination basePath={basePath} params={params2} page={page} pageSize={PAGE_SIZE} total={data.total} />
        </>
      )}
    </div>
  );
}
