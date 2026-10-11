import { formatMoney } from "@/lib/format";
import type { PublicOrder } from "@/lib/validators/orders";

const paid = (s: string) => ["paid", "partially_refunded", "refunded"].includes(s);

function headline(o: PublicOrder): { title: string; body: string } {
  if (o.status === "pending") return { title: "Confirming your payment…", body: "This usually takes a few seconds. This page updates by itself." };
  if (o.status === "cancelled") {
    return paid(o.payment_status)
      ? { title: "This order was cancelled.", body: "If you were charged, you'll be refunded in full." }
      : { title: "This order was cancelled.", body: "You were not charged." };
  }
  if (o.payment_status === "refunded") return { title: "This order was refunded.", body: "The refund can take a few days to appear on your statement." };
  if (o.fulfillment_status === "delivered") return { title: "Delivered.", body: "We hope you love it." };
  if (o.fulfillment_status === "shipped") return { title: "On its way.", body: o.tracking_number ? `Tracking number: ${o.tracking_number}` : "Your order has shipped." };
  return { title: "Thank you, your order is confirmed.", body: "We're getting it ready to ship." };
}

export function OrderView({ order: o }: { order: PublicOrder }) {
  const h = headline(o);
  const steps = [
    { label: "Placed", done: true },
    { label: "Paid", done: paid(o.payment_status) },
    { label: "Shipped", done: ["shipped", "delivered"].includes(o.fulfillment_status) },
    { label: "Delivered", done: o.fulfillment_status === "delivered" },
  ];
  const a = o.shipping_address;
  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-sm text-muted">Order #{o.order_number}</p>
        <h1 className="mt-1 font-display text-5xl leading-none tracking-tight">{h.title}</h1>
        <p className="mt-3 text-muted" role="status">{h.body}</p>
      </div>

      {o.status === "confirmed" && o.payment_status !== "refunded" && (
        <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
          {steps.map((s) => (
            <li key={s.label} aria-current={undefined}>
              <div className={`h-1.5 rounded-full ${s.done ? "bg-violet" : "bg-raised"}`} />
              <p className={`mt-2 text-xs ${s.done ? "text-fg" : "text-muted"}`}>{s.label}<span className="sr-only">{s.done ? " (done)" : " (not yet)"}</span></p>
            </li>
          ))}
        </ol>
      )}

      <section className="panel p-6" aria-labelledby="items-h">
        <h2 id="items-h" className="mb-4 font-display text-2xl">Items</h2>
        <ul className="divide-y divide-line">
          {o.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4 py-3 text-sm">
              <span>{l.quantity} × {l.name}{l.variant ? <span className="text-muted"> ({l.variant})</span> : null}</span>
              <span className="font-mono">{formatMoney(l.unit_price_cents * l.quantity, o.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          {o.refunded_cents > 0 && (
            <div className="flex justify-between text-muted"><dt>Refunded</dt><dd className="font-mono">−{formatMoney(o.refunded_cents, o.currency)}</dd></div>
          )}
          <div className="flex justify-between font-medium"><dt>Total</dt><dd className="font-mono">{formatMoney(o.total_cents, o.currency)}</dd></div>
        </dl>
      </section>

      {a && (
        <section className="panel p-6" aria-labelledby="ship-h">
          <h2 id="ship-h" className="mb-2 font-display text-2xl">Shipping to</h2>
          <address className="text-sm not-italic text-muted">
            {o.customer_name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
            {[a.city, a.region, a.postal_code].filter(Boolean).join(", ")}<br />{a.country}
          </address>
        </section>
      )}
    </div>
  );
}
