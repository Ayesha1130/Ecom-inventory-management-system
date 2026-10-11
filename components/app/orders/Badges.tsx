type O = { status: string; payment_status: string; fulfillment_status: string };

const tones = {
  warn: "bg-warn/15 text-warn",
  good: "bg-cyan/15 text-cyan",
  violet: "bg-violet/20 text-violet",
  muted: "bg-white/8 text-muted",
} as const;

export function orderState(o: O): { label: string; tone: keyof typeof tones } {
  const paid = ["paid", "partially_refunded"].includes(o.payment_status);
  if (o.status === "cancelled") return paid ? { label: "Refund needed", tone: "warn" } : { label: "Cancelled", tone: "muted" };
  if (o.status === "pending") return { label: "Awaiting payment", tone: "warn" };
  if (o.payment_status === "refunded") return { label: "Refunded", tone: "muted" };
  if (o.fulfillment_status === "delivered") return { label: "Delivered", tone: "good" };
  if (o.fulfillment_status === "shipped") return { label: "Shipped", tone: "good" };
  return { label: "To fulfill", tone: "violet" };
}

export function OrderStateBadge({ order }: { order: O }) {
  const s = orderState(order);
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${tones[s.tone]}`}>{s.label}</span>;
}

const payLabel: Record<string, string> = { unpaid: "Unpaid", paid: "Paid", partially_refunded: "Partly refunded", refunded: "Refunded" };
export function PaymentBadge({ status }: { status: string }) {
  const tone = status === "paid" ? tones.good : status === "unpaid" ? tones.warn : tones.muted;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${tone}`}>{payLabel[status] ?? status}</span>;
}
