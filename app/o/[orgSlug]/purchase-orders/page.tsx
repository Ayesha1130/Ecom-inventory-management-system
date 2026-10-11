import Link from "next/link";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { formatDateTime, formatMoney } from "@/lib/format";
import { buildHref, parsePage } from "@/lib/query";
import { poListSchema } from "@/lib/validators/ops";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pagination } from "@/components/app/Pagination";
import { Pill } from "@/components/app/Pill";
import { poLabel, poTone } from "@/components/app/purchasing/po-status";

const PAGE_SIZE = 25;
const FILTERS = [["", "All"], ["draft", "Draft"], ["ordered", "Ordered"], ["partially_received", "Partly received"], ["received", "Received"], ["cancelled", "Cancelled"]] as const;

export default async function PurchaseOrdersPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const status = FILTERS.find(([k]) => k === sp.status)?.[0] ?? "";
  const page = parsePage(sp.page);
  const { data, error } = await supabase.rpc("list_purchase_orders", { p_org: org.id, p_status: status || null, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  if (error) throw new Error("Couldn't load purchase orders.");
  const list = poListSchema.parse(data);
  const base = `/o/${org.slug}/purchase-orders`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-4xl">Purchase orders</h1><p className="mt-1 text-sm text-muted">{list.total} {status ? "matching" : "total"}</p></div>
        {hasRole(role, "manager") && <Link href={`${base}/new`} className="rounded-full bg-violet px-5 py-2.5 text-sm font-medium">New purchase order</Link>}
      </div>
      <nav aria-label="Status" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([key, name]) => (
          <Link key={key || "all"} href={buildHref(base, { status: key || undefined })} aria-current={key === status ? "page" : undefined}
            className={`rounded-full border border-line px-3.5 py-1.5 ${key === status ? "bg-white/10" : "text-muted hover:text-fg"}`}>{name}</Link>
        ))}
      </nav>
      {list.rows.length === 0 ? (
        <Card title="Purchase orders"><EmptyState title="No purchase orders" body="Order stock from a supplier, then receive it here to add it to inventory." /></Card>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Purchase orders</caption>
              <thead className="border-b border-line text-xs text-muted"><tr>
                <th className="px-4 py-3 font-normal">PO</th><th className="px-4 py-3 font-normal">Supplier</th><th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Expected</th><th className="px-4 py-3 text-right font-normal">Received</th><th className="px-4 py-3 text-right font-normal">Cost</th></tr></thead>
              <tbody>
                {list.rows.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3"><Link href={`${base}/${p.id}`} className="font-mono hover:underline">PO-{p.po_number}</Link><p className="text-xs text-muted">{formatDateTime(p.created_at)}</p></td>
                    <td className="px-4 py-3">{p.supplier_name}</td>
                    <td className="px-4 py-3"><Pill tone={poTone[p.status] ?? "muted"}>{poLabel[p.status] ?? p.status}</Pill></td>
                    <td className="px-4 py-3 text-muted">{p.expected_at ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{p.units_received} / {p.units_ordered}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(p.total_cost_cents, org.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath={base} params={{ status: status || undefined }} page={page} pageSize={PAGE_SIZE} total={list.total} />
        </>
      )}
    </div>
  );
}
