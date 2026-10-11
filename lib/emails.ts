import { formatMoney } from "@/lib/format";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Line = { name: string; variant: string | null; quantity: number; unit_price_cents: number };
type OrderMail = {
  order_number: number; customer_name: string | null; total_cents: number; currency: string;
  store_name: string; lines: Line[]; trackUrl: string; tracking_number?: string | null;
};

function lineText(l: Line, currency: string) {
  return `${l.quantity} x ${l.name}${l.variant ? ` (${l.variant})` : ""}  ${formatMoney(l.unit_price_cents * l.quantity, currency)}`;
}
function wrap(store: string, body: string) {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1c1b18">
<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(store)}</h1>${body}</div>`;
}

export function orderConfirmationEmail(o: OrderMail) {
  const who = o.customer_name ? ` ${o.customer_name.split(" ")[0]}` : "";
  const text = [
    `Thanks${who}! We received your order #${o.order_number}.`, "",
    ...o.lines.map((l) => lineText(l, o.currency)), "",
    `Total: ${formatMoney(o.total_cents, o.currency)}`, "", `Track your order: ${o.trackUrl}`,
  ].join("\n");
  const html = wrap(o.store_name, `<p>Thanks${escapeHtml(who)}! We received your order <b>#${o.order_number}</b>.</p>
<ul>${o.lines.map((l) => `<li>${escapeHtml(lineText(l, o.currency))}</li>`).join("")}</ul>
<p><b>Total: ${escapeHtml(formatMoney(o.total_cents, o.currency))}</b></p>
<p><a href="${escapeHtml(o.trackUrl)}">Track your order</a></p>`);
  return { subject: `Order #${o.order_number} confirmed`, html, text };
}

export function orderShippedEmail(o: OrderMail) {
  const tracking = o.tracking_number ? `Tracking number: ${o.tracking_number}` : "";
  const text = [`Your order #${o.order_number} is on its way.`, tracking, "", `Details: ${o.trackUrl}`].filter(Boolean).join("\n");
  const html = wrap(o.store_name, `<p>Your order <b>#${o.order_number}</b> is on its way.</p>
${tracking ? `<p>${escapeHtml(tracking)}</p>` : ""}<p><a href="${escapeHtml(o.trackUrl)}">View order details</a></p>`);
  return { subject: `Order #${o.order_number} has shipped`, html, text };
}

export function invitationEmail(o: { organization: string; role: string; inviter: string | null; link: string }) {
  const by = o.inviter ? `${o.inviter} invited you` : "You've been invited";
  const text = `${by} to join ${o.organization} on Nexora as ${o.role}.\n\nAccept the invitation: ${o.link}\n\nThis link expires in 7 days.`;
  const html = wrap(o.organization, `<p>${escapeHtml(by)} to join <b>${escapeHtml(o.organization)}</b> as <b>${escapeHtml(o.role)}</b>.</p>
<p><a href="${escapeHtml(o.link)}">Accept the invitation</a></p><p style="color:#6b665b;font-size:13px">This link expires in 7 days.</p>`);
  return { subject: `Join ${o.organization} on Nexora`, html, text };
}
