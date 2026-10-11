import { sendEmail } from "@/lib/email";
import { orderConfirmationEmail, orderShippedEmail } from "@/lib/emails";
import type { ConfirmedOrder } from "@/lib/stripe-webhook";

function origin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
const trackUrl = (slug: string, n: number) => `${origin()}/s/${slug}/track?order=${n}`;

export async function sendOrderConfirmation(order: ConfirmedOrder) {
  if (!order.customer_email) return;
  await sendEmail({ to: order.customer_email, ...orderConfirmationEmail({ ...order, trackUrl: trackUrl(order.store_slug, order.order_number) }) });
}

export async function sendOrderShipped(order: ConfirmedOrder & { tracking_number: string | null }) {
  if (!order.customer_email) return;
  await sendEmail({ to: order.customer_email, ...orderShippedEmail({ ...order, trackUrl: trackUrl(order.store_slug, order.order_number) }) });
}
