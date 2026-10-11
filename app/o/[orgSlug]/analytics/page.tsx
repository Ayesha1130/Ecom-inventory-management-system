import { requireOrgAccess } from "@/lib/authz";
import { formatMoney } from "@/lib/format";
import { analyticsSchema } from "@/lib/validators/ops";
import { RevenueChart, WeeklyCustomersChart } from "@/components/app/LazyCharts";
import { Card, EmptyState } from "@/components/app/Panels";
import { RANGES, RangeTabs, type RangeKey } from "@/components/app/RangeTabs";
import { StatCard } from "@/components/app/StatCard";

const DAY = 86_400_000;

export default async function AnalyticsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>; searchParams: Promise<{ range?: string }>;
}) {
  const { orgSlug } = await params;
  const { range } = await searchParams;
  const { supabase, org } = await requireOrgAccess(orgSlug);
  const key: RangeKey = range && range in RANGES ? (range as RangeKey) : "30d";
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY);
  const start = new Date(end.getTime() - RANGES[key] * DAY);

  const { data, error } = await supabase.rpc("analytics_summary", { p_org: org.id, p_from: start.toISOString(), p_to: end.toISOString() });
  if (error) throw new Error("Couldn't load analytics.");
  const a = analyticsSchema.parse(data);
  const maxCat = Math.max(1, ...a.by_category.map((c) => c.revenue_cents));
  const exportBase = `/o/${org.slug}/analytics/export?range=${key}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-4xl">Analytics</h1><p className="mt-1 text-sm text-muted">Paid orders only. Revenue is net of refunds.</p></div>
        <RangeTabs slug={org.slug} active={key} path="/analytics" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(a.revenue_cents, org.currency)} />
        <StatCard label="Paid orders" value={a.orders.toLocaleString("en-US")} />
        <StatCard label="Average order value" value={a.orders ? formatMoney(a.aov_cents, org.currency) : "—"} hint="Net revenue ÷ paid orders" />
        <StatCard label="Units sold" value={a.units.toLocaleString("en-US")} />
      </div>

      {a.orders === 0 ? (
        <Card title="Activity"><EmptyState title="No paid orders in this period" body="Try a longer date range." /></Card>
      ) : (
        <>
          <Card title="Revenue by day"><RevenueChart data={a.daily} currency={org.currency} /></Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Sales by category (gross item sales)">
              <ul className="space-y-4">
                {a.by_category.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between text-sm"><span>{c.name}</span><span className="font-mono">{formatMoney(c.revenue_cents, org.currency)}</span></div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/8"><div className="h-full rounded-full bg-violet" style={{ width: `${(c.revenue_cents / maxCat) * 100}%` }} /></div>
                    <p className="mt-1 text-xs text-muted">{c.units} units</p>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Best sellers">
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <caption className="sr-only">Best-selling products</caption>
                <thead className="text-xs text-muted"><tr><th className="pb-2 font-normal">Product</th><th className="pb-2 text-right font-normal">Units</th><th className="pb-2 text-right font-normal">Sales</th></tr></thead>
                <tbody>{a.best_sellers.map((b) => (
                  <tr key={b.name} className="border-t border-line"><td className="py-2">{b.name}</td><td className="py-2 text-right font-mono">{b.units}</td><td className="py-2 text-right font-mono">{formatMoney(b.revenue_cents, org.currency)}</td></tr>
                ))}</tbody>
              </table></div>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="New vs returning buyers by week"><WeeklyCustomersChart data={a.weekly_customers} /></Card>
            <Card title="Inventory turnover (estimate)">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-muted">Turnover</dt><dd className="mt-1 font-mono text-2xl">{a.turnover === null ? "—" : `${a.turnover}x`}</dd></div>
                <div><dt className="text-muted">Days of stock</dt><dd className="mt-1 font-mono text-2xl">{a.days_of_inventory === null ? "—" : Math.round(a.days_of_inventory).toLocaleString("en-US")}</dd></div>
                <div><dt className="text-muted">Cost of goods sold</dt><dd className="mt-1 font-mono">{formatMoney(a.cogs_cents, org.currency)}</dd></div>
                <div><dt className="text-muted">Stock value now</dt><dd className="mt-1 font-mono">{formatMoney(a.inventory_value_cents, org.currency)}</dd></div>
              </dl>
              <p className="mt-4 text-xs text-muted">Estimated: sales for the period at today&apos;s unit costs, divided by today&apos;s stock value. It becomes exact once stock snapshots are recorded over time.</p>
            </Card>
          </div>
        </>
      )}

      <Card title="Export reports">
        <p className="text-sm text-muted">CSV files for the selected range (orders) or the current stock position (inventory).</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a href={`${exportBase}&type=orders`} download className="rounded-full border border-line px-4 py-2 hover:bg-white/6">Orders CSV</a>
          <a href={`${exportBase}&type=inventory`} download className="rounded-full border border-line px-4 py-2 hover:bg-white/6">Inventory CSV</a>
        </div>
      </Card>
    </div>
  );
}
