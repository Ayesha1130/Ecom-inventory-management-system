import { requireOrgAccess } from "@/lib/authz";
import { dashboardSchema } from "@/lib/validators/dashboard";
import { formatMoney, percentChange } from "@/lib/format";
import { RANGES, RangeTabs, type RangeKey } from "@/components/app/RangeTabs";
import { StatCard } from "@/components/app/StatCard";
import { OrdersChart, RevenueChart } from "@/components/app/LazyCharts";
import { Card, EmptyState, LowStock, RecentOrders, TopProducts } from "@/components/app/Panels";

const DAY = 86_400_000;

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { orgSlug } = await params;
  const { range } = await searchParams;
  const { supabase, org, readOnly } = await requireOrgAccess(orgSlug);

  const key: RangeKey = range && range in RANGES ? (range as RangeKey) : "30d";
  const days = RANGES[key];
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY); // start of tomorrow, UTC
  const start = new Date(end.getTime() - days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);

  const call = (from: Date, to: Date) =>
    supabase.rpc("dashboard_summary", { p_org: org.id, p_from: from.toISOString(), p_to: to.toISOString() });
  const [cur, prev] = await Promise.all([call(start, end), call(prevStart, start)]);
  if (cur.error) throw new Error("Couldn't load the dashboard.");
  const summary = dashboardSchema.parse(cur.data);
  const before = prev.error ? null : dashboardSchema.safeParse(prev.data);
  const prevData = before?.success ? before.data : null;

  const vs = `vs previous ${days} days`;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Overview</h1>
          {readOnly && <p className="mt-1 text-sm text-muted">Simulated demonstration data.</p>}
        </div>
        <RangeTabs slug={org.slug} active={key} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(summary.revenue_cents, org.currency)}
          delta={prevData ? percentChange(summary.revenue_cents, prevData.revenue_cents) : null} hint={vs} />
        <StatCard label="Orders" value={summary.orders.toLocaleString("en-US")}
          delta={prevData ? percentChange(summary.orders, prevData.orders) : null} hint={vs} />
        <StatCard label="Active products" value={summary.active_products.toLocaleString("en-US")} hint="Currently on sale" />
        <StatCard label="Low stock" value={String(summary.low_stock_count)}
          tone={summary.low_stock_count > 0 ? "warn" : undefined} hint="At or below threshold" />
      </div>

      {summary.orders === 0 ? (
        <Card title="Activity"><EmptyState title="No orders in this period" body="Try a longer date range, or wait for your first order." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Revenue (paid orders)"><RevenueChart data={summary.daily} currency={org.currency} /></Card>
          <Card title="Orders per day"><OrdersChart data={summary.daily} /></Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Top products" className="lg:col-span-1"><TopProducts items={summary.top_products} currency={org.currency} /></Card>
        <Card title="Inventory alerts" className="lg:col-span-1"><LowStock items={summary.low_stock} /></Card>
        <Card title="Recent orders" className="lg:col-span-3"><RecentOrders orders={summary.recent_orders} currency={org.currency} /></Card>
      </div>
    </div>
  );
}
