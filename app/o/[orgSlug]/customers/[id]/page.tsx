import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { formatDateTime, formatMoney } from "@/lib/format";
import { customerDetailSchema } from "@/lib/validators/ops";
import { AddNote } from "@/components/app/customers/AddNote";
import { OrderStateBadge } from "@/components/app/orders/Badges";
import { Card } from "@/components/app/Panels";
import { Pill } from "@/components/app/Pill";
import { StatCard } from "@/components/app/StatCard";

export default async function CustomerPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const { data } = await supabase.rpc("get_customer", { p_org: org.id, p_customer: id });
  if (!data) notFound();
  const c = customerDetailSchema.parse(data);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href={`/o/${org.slug}/customers`} className="text-sm text-muted hover:text-fg">← Customers</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl">{c.customer.full_name}</h1>
          <Pill tone={c.segment === "vip" ? "violet" : c.segment === "prospect" ? "muted" : "good"}>{c.segment === "prospect" ? "No purchases" : c.segment.toUpperCase() === "VIP" ? "VIP" : c.segment[0]!.toUpperCase() + c.segment.slice(1)}</Pill>
        </div>
        <p className="mt-1 text-sm text-muted">{c.customer.email} · customer since {formatDateTime(c.customer.created_at)}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Paid orders" value={String(c.orders)} />
        <StatCard label="Total spent" value={formatMoney(c.spent_cents, org.currency)} hint="Net of refunds" />
        <StatCard label="Average order" value={c.orders ? formatMoney(Math.round(c.spent_cents / c.orders), org.currency) : "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Orders" className="lg:col-span-2">
          {c.recent_orders.length === 0 ? <p className="text-sm text-muted">No orders yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm">
              <caption className="sr-only">Customer orders</caption>
              <tbody>
                {c.recent_orders.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <td className="py-2.5"><Link href={`/o/${org.slug}/orders/${o.id}`} className="font-mono hover:underline">#{o.order_number}</Link><p className="text-xs text-muted">{formatDateTime(o.placed_at)}</p></td>
                    <td className="py-2.5"><OrderStateBadge order={o} /></td>
                    <td className="py-2.5 text-right font-mono">{formatMoney(o.total_cents, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
        <Card title="Notes">
          {hasRole(role, "staff") && <AddNote slug={org.slug} customerId={id} />}
          <ul className="mt-4 space-y-3">
            {c.notes.length === 0 && <li className="text-sm text-muted">No notes yet.</li>}
            {c.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-white/4 p-3 text-sm">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{n.author ?? "Team member"} · {formatDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
