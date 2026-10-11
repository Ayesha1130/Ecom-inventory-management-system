import type Stripe from "stripe";
import { z } from "zod";

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export type ConfirmedOrder = {
  order_number: number; customer_email: string | null; customer_name: string | null;
  total_cents: number; currency: string; store_name: string; store_slug: string;
  lines: { name: string; variant: string | null; quantity: number; unit_price_cents: number }[];
};
export type WebhookDeps = { rpc: Rpc; onConfirmed?: (order: ConfirmedOrder) => Promise<void> };

const resultSchema = z.object({ status: z.string() }).passthrough();

async function call(rpc: Rpc, fn: string, args: Record<string, unknown>) {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`); // surfaces as a 500 so Stripe retries
  return resultSchema.parse(data);
}

/**
 * Applies one verified Stripe event. All idempotency lives in the database: confirm_order_payment and
 * expire_order_session insert the event id into processed_events in the same transaction as their work.
 */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<{ handled: boolean; result?: string }> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      // card payments are 'paid' immediately; delayed methods complete later via async_payment_succeeded
      if (event.type === "checkout.session.completed" && s.payment_status !== "paid") return { handled: false, result: "awaiting_payment" };
      if (s.amount_total == null || !s.currency) throw new Error("Session is missing amount or currency");
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
      const r = await call(deps.rpc, "confirm_order_payment", {
        p_event_id: event.id, p_session_id: s.id, p_payment_intent: pi, p_amount: s.amount_total, p_currency: s.currency,
      });
      if (r.status === "confirmed" && deps.onConfirmed) {
        try {
          await deps.onConfirmed(r as unknown as ConfirmedOrder);
        } catch (e) {
          // never fail the webhook over a notification: a retry would be a no-op and the email can't be deduplicated
          console.error("order confirmation notification failed", e instanceof Error ? e.message : e);
        }
      }
      return { handled: true, result: r.status };
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const reason = event.type === "checkout.session.expired" ? "expired" : "payment_failed";
      const r = await call(deps.rpc, "expire_order_session", { p_event_id: event.id, p_session_id: s.id, p_reason: reason });
      return { handled: true, result: r.status };
    }
    default:
      return { handled: false, result: "ignored" };
  }
}

export async function processStripeWebhook(
  rawBody: string,
  signature: string | null,
  verify: (rawBody: string, signature: string) => Stripe.Event,
  deps: WebhookDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!signature) return { status: 400, body: { error: "Missing signature" } };
  let event: Stripe.Event;
  try {
    event = verify(rawBody, signature);
  } catch {
    return { status: 400, body: { error: "Invalid signature" } };
  }
  try {
    return { status: 200, body: { received: true, ...(await handleStripeEvent(event, deps)) } };
  } catch (e) {
    console.error("stripe webhook processing failed", event.id, e instanceof Error ? e.message : e);
    return { status: 500, body: { error: "Processing failed" } };
  }
}
