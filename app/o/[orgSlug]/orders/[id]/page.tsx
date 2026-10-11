import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { formatDateTime, formatMoney } from "@/lib/format";
import { orderDetailSchema } from "@/lib/validators/orders";
import { OrderActions } from "@/components/app/orders/OrderActions";
import { OrderStateBadge, PaymentBadge } from "@/components/app/orders/Badges";
import { Card } from "@/components/app/Panels";

export default async function OrderDetailPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const { data } = await supabase.rpc("get_order", { p_org: org.id, p_order: id });
  if (!data) notFound();
  const d = orderDetailSchema.parse(data);
  const o = d.order;
  const remaining = o.total_cents - o.refunded_cents;
  const a = o.shipping_address;
  const refundable = ["paid", "partially_refunded"].includes(o.payment_status) && !!d.payments[0]?.stripe_payment_intent;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href={`/o/${org.slug}/orders`} className="text-sm text-muted hover:text-fg">← Orders</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl">Order #{o.order_number}</h1>
          <OrderStateBadge order={o} /><PaymentBadge status={o.payment_status} />
        </div>
        <p className="mt-1 text-sm text-muted">Placed {formatDateTime(o.placed_at)}{o.cancel_reason ? ` · cancelled (${o.cancel_reason})` : ""}</p>
      </div>

      {o.status === "cancelled" && ["paid", "partially_refunded"].includes(o.payment_status) && (
        <p role="alert" className="rounded-[14px] border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
          Payment was received but this order was cancelled (it paid after its stock reservation expired). Refund it to resolve.
        </p>
      )}
      {!refundable && ["paid", "partially_refunded"].includes(o.payment_status) && d.payments.length === 0 && (
        <p className="text-sm text-muted">This is a seeded demo order with no Stripe payment record, so it can&apos;t be refunded.</p>
      )}

      <OrderActions slug={org.slug} orderId={o.id} currency={o.currency} status={o.status} paymentStatus={o.payment_status}
        fulfillmentStatus={o.fulfillment_status} remainingCents={remaining} refundable={refundable}
        canFulfill={hasRole(role, "staff")} canManage={hasRole(role, "manager")} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Items">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-sm">
                <caption className="sr-only">Order items</caption>
                <thead className="text-xs text-muted"><tr>
                  <th className="pb-2 font-normal">Item</th><th className="pb-2 text-right font-normal">Qty</th>
                  <th className="pb-2 text-right font-normal">Price</th><th className="pb-2 text-right font-normal">Total</th></tr></thead>
                <tbody>
                  {d.items.map((i, k) => (
                    <tr key={k} className="border-t border-line">
                      <td className="py-2.5">{i.product_name}{i.variant_label ? <span className="text-muted"> · {i.variant_label}</span> : null}<p className="font-mono text-xs text-muted">{i.sku}</p></td>
                      <td className="py-2.5 text-right font-mono">{i.quantity}</td>
                      <td className="py-2.5 text-right font-mono">{formatMoney(i.unit_price_cents, o.currency)}</td>
                      <td className="py-2.5 text-right font-mono">{formatMoney(i.unit_price_cents * i.quantity, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              {o.refunded_cents > 0 && <div className="flex justify-between text-muted"><dt>Refunded</dt><dd className="font-mono">−{formatMoney(o.refunded_cents, o.currency)}</dd></div>}
              <div className="flex justify-between font-medium"><dt>Total</dt><dd className="font-mono">{formatMoney(o.total_cents, o.currency)}</dd></div>
            </dl>
          </Card>
          <Card title="Timeline">
            <ol className="space-y-3 border-l border-line pl-4">
              {d.events.map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-violet" />
                  <p>{e.message}</p><p className="text-xs text-muted">{formatDateTime(e.created_at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Customer">
            <p className="text-sm">{o.customer_name ?? d.customer?.full_name ?? "Guest"}</p>
            <p className="text-sm text-muted">{o.customer_email ?? d.customer?.email}</p>
          </Card>
          <Card title="Shipping">
            {a ? (
              <address className="text-sm not-italic text-muted">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{[a.city, a.region, a.postal_code].filter(Boolean).join(", ")}<br />{a.country}</address>
            ) : <p className="text-sm text-muted">No address on file.</p>}
            {o.tracking_number && <p className="mt-2 font-mono text-xs">Tracking: {o.tracking_number}</p>}
          </Card>
          <Card title="Payments">
            {d.payments.length === 0 && d.refunds.length === 0 && <p className="text-sm text-muted">No payment records.</p>}
            <ul className="space-y-2 text-sm">
              {d.payments.map((p, i) => (
                <li key={i} className="flex justify-between"><span>Paid<span className="block font-mono text-xs text-muted">{p.stripe_payment_intent}</span></span><span className="font-mono">{formatMoney(p.amount_cents, p.currency)}</span></li>
              ))}
              {d.refunds.map((r, i) => (
                <li key={i} className="flex justify-between text-muted"><span>Refund{r.reason ? `: ${r.reason}` : ""}{r.restocked ? " (restocked)" : ""}</span><span className="font-mono">−{formatMoney(r.amount_cents, o.currency)}</span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
