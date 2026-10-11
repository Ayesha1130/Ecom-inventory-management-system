import { formatDateTime, formatMoney } from "@/lib/format";
import type { DashboardSummary } from "@/lib/validators/dashboard";

export function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      <h2 className="mb-4 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}

const badge: Record<string, string> = {
  paid: "bg-cyan/15 text-cyan",
  confirmed: "bg-cyan/15 text-cyan",
  pending: "bg-warn/15 text-warn",
  unpaid: "bg-warn/15 text-warn",
  cancelled: "bg-white/8 text-muted",
};

export function TopProducts({ items, currency }: { items: DashboardSummary["top_products"]; currency: string }) {
  if (!items.length) return <EmptyState title="No sales yet" body="Top sellers appear once paid orders come in." />;
  const max = Math.max(...items.map((i) => i.revenue_cents));
  return (
    <ol className="space-y-4">
      {items.map((p) => (
        <li key={p.name}>
          <div className="flex justify-between text-sm">
            <span>{p.name}</span>
            <span className="font-mono">{formatMoney(p.revenue_cents, currency)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/8">
            <div className="h-full rounded-full bg-violet" style={{ width: `${(p.revenue_cents / max) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{p.units} units</p>
        </li>
      ))}
    </ol>
  );
}

export function LowStock({ items }: { items: DashboardSummary["low_stock"] }) {
  if (!items.length) return <EmptyState title="Stock looks healthy" body="Nothing is at or below its reorder threshold." />;
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.sku} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="truncate">{i.product}{i.variant ? ` · ${i.variant}` : ""}</p>
            <p className="font-mono text-xs text-muted">{i.sku}</p>
          </div>
          <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 font-mono text-xs text-warn">
            {i.available} left
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecentOrders({ orders, currency }: { orders: DashboardSummary["recent_orders"]; currency: string }) {
  if (!orders.length) return <EmptyState title="No orders yet" body="New orders from your storefront will show up here." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm">
        <caption className="sr-only">Most recent orders</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th className="pb-2 font-normal">Order</th>
            <th className="pb-2 font-normal">Customer</th>
            <th className="pb-2 font-normal">Status</th>
            <th className="pb-2 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-line">
              <td className="py-2.5">
                <p className="font-mono">#{o.order_number}</p>
                <p className="text-xs text-muted">{formatDateTime(o.placed_at)}</p>
              </td>
              <td className="py-2.5">{o.customer ?? "Guest"}</td>
              <td className="py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs ${badge[o.status === "confirmed" ? o.payment_status : o.status] ?? "bg-white/8 text-muted"}`}>
                  {o.status === "confirmed" ? o.payment_status : o.status}
                </span>
              </td>
              <td className="py-2.5 text-right font-mono">{formatMoney(o.total_cents, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
