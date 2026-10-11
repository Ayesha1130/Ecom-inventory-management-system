import Link from "next/link";
import { requireOrgAccess } from "@/lib/authz";
import { formatDateTime, formatMoney } from "@/lib/format";
import { buildHref, parsePage } from "@/lib/query";
import { orderListSchema } from "@/lib/validators/orders";
import { OrderStateBadge, PaymentBadge } from "@/components/app/orders/Badges";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pagination } from "@/components/app/Pagination";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;
const FILTERS = [
  ["all", "All"], ["to_fulfill", "To fulfill"], ["pending", "Awaiting payment"], ["shipped", "Shipped"],
  ["needs_refund", "Refund needed"], ["refunded", "Refunded"], ["cancelled", "Cancelled"],
] as const;

export default async function OrdersPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, org } = await requireOrgAccess(orgSlug);
  const q = (sp.q ?? "").slice(0, 100);
  const filter = FILTERS.find(([k]) => k === sp.filter)?.[0] ?? "all";
  const page = parsePage(sp.page);

  const { data, error } = await supabase.rpc("list_orders", {
    p_org: org.id, p_search: q || null, p_filter: filter, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error("Couldn't load orders.");
  const list = orderListSchema.parse(data);
  const base = `/o/${org.slug}/orders`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Orders</h1>
        <p className="mt-1 text-sm text-muted">{list.total.toLocaleString("en-US")} {filter === "all" && !q ? "total" : "matching"}</p>
      </div>
      <nav aria-label="Order filters" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={buildHref(base, { filter: key === "all" ? undefined : key, q })} aria-current={key === filter ? "page" : undefined}
            className={`rounded-full border border-line px-3.5 py-1.5 ${key === filter ? "bg-white/10" : "text-muted hover:text-fg"}`}>{label}</Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <div className="w-full sm:w-80"><Field id="q" name="q" label="Search" placeholder="Order number, name or email" defaultValue={q} /></div>
        <Button type="submit" variant="ghost">Search</Button>
      </form>

      {list.rows.length === 0 ? (
        <Card title="Orders"><EmptyState title={filter === "all" && !q ? "No orders yet" : "No orders match"} body={filter === "all" && !q ? "Orders from your storefront appear here." : "Try a different filter or search."} /></Card>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Orders</caption>
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-normal">Order</th><th className="px-4 py-3 font-normal">Customer</th>
                  <th className="px-4 py-3 font-normal">Status</th><th className="px-4 py-3 font-normal">Payment</th>
                  <th className="px-4 py-3 text-right font-normal">Items</th><th className="px-4 py-3 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`${base}/${o.id}`} className="font-mono hover:underline">#{o.order_number}</Link>
                      <p className="text-xs text-muted">{formatDateTime(o.placed_at)}</p>
                    </td>
                    <td className="px-4 py-3">{o.customer_name ?? "Guest"}<p className="text-xs text-muted">{o.customer_email}</p></td>
                    <td className="px-4 py-3"><OrderStateBadge order={o} /></td>
                    <td className="px-4 py-3"><PaymentBadge status={o.payment_status} /></td>
                    <td className="px-4 py-3 text-right font-mono">{o.item_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(o.total_cents, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath={base} params={{ filter: filter === "all" ? undefined : filter, q }} page={page} pageSize={PAGE_SIZE} total={list.total} />
        </>
      )}
    </div>
  );
}
