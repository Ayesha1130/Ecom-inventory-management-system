import Link from "next/link";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { formatMoney } from "@/lib/format";
import { parsePage } from "@/lib/query";
import { inventoryListSchema } from "@/lib/validators/catalog";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pagination } from "@/components/app/Pagination";
import { StatCard } from "@/components/app/StatCard";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { InventoryTable } from "@/components/app/inventory/InventoryTable";
import { AddWarehouse } from "@/components/app/inventory/AddWarehouse";

const PAGE_SIZE = 25;

export default async function InventoryPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const canWrite = hasRole(role, "manager");
  const q = (sp.q ?? "").slice(0, 100);
  const low = sp.low === "1";
  const page = parsePage(sp.page);

  const [list, wh] = await Promise.all([
    supabase.rpc("list_inventory", { p_org: org.id, p_search: q || null, p_low_only: low, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE }),
    supabase.from("warehouses").select("id, name, code").eq("organization_id", org.id).order("name"),
  ]);
  if (list.error) throw new Error("Couldn't load inventory.");
  const data = inventoryListSchema.parse(list.data);
  const warehouses = wh.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl">Inventory</h1>
        <Link href={`/o/${org.slug}/inventory/movements`} className="rounded-full border border-line px-5 py-2.5 text-sm hover:bg-white/6">Stock history</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Units on hand" value={data.summary.units.toLocaleString("en-US")} hint={`Across ${warehouses.length} location${warehouses.length === 1 ? "" : "s"}`} />
        <StatCard label="Inventory value" value={formatMoney(data.summary.valuation_cents, org.currency)} hint="On hand x unit cost" />
        <StatCard label="Low stock" value={String(data.summary.low_count)} tone={data.summary.low_count > 0 ? "warn" : undefined} hint="At or below reorder point" />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72"><Field id="q" name="q" label="Search" placeholder="Product or SKU" defaultValue={q} /></div>
        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={low} /> Low stock only
        </label>
        <Button type="submit" variant="ghost">Apply</Button>
      </form>

      {data.rows.length === 0 ? (
        <Card title="Stock">
          <EmptyState
            title={q || low ? "Nothing matches" : "No inventory yet"}
            body={q || low ? "Try a different search or clear the filters." : "Create a product, then add stock to it here."} />
        </Card>
      ) : (
        <>
          <InventoryTable rows={data.rows} warehouses={warehouses} slug={org.slug} canWrite={canWrite} currency={org.currency} />
          <Pagination basePath={`/o/${org.slug}/inventory`} params={{ q, low: low ? "1" : undefined }} page={page} pageSize={PAGE_SIZE} total={data.total} />
        </>
      )}
      {canWrite && <AddWarehouse slug={org.slug} />}
    </div>
  );
}
