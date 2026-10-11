"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { friendlyDbError } from "@/lib/db-errors";
import { toCents } from "@/lib/money";
import { sendOrderShipped } from "@/lib/order-notify";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { fulfillSchema, orderDetailSchema, refundFormSchema, type RefundFormValues } from "@/lib/validators/orders";

type Result = { error?: string; ok?: boolean };
const slugSchema = z.string().min(3).max(40);
const idSchema = z.string().uuid();

async function load(orgSlug: string, orderId: string) {
  const ctx = await requireOrgAccess(slugSchema.parse(orgSlug));
  const id = idSchema.safeParse(orderId);
  if (!id.success) return { ctx, detail: null };
  const { data } = await ctx.supabase.rpc("get_order", { p_org: ctx.org.id, p_order: id.data });
  const parsed = orderDetailSchema.safeParse(data);
  return { ctx, detail: parsed.success ? parsed.data : null };
}
const done = (slug: string, id: string): Result => {
  revalidatePath(`/o/${slug}/orders`);
  revalidatePath(`/o/${slug}/orders/${id}`);
  revalidatePath(`/o/${slug}`);
  revalidatePath(`/o/${slug}/inventory`);
  return { ok: true };
};

export async function fulfillOrderAction(orgSlug: string, orderId: string, to: "shipped" | "delivered", tracking: string): Promise<Result> {
  const p = fulfillSchema.safeParse({ to, tracking });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { ctx, detail } = await load(orgSlug, orderId);
  if (!hasRole(ctx.role, "staff")) return { error: "You don't have permission to fulfill orders." };
  if (!detail) return { error: "Order not found." };

  const { error } = await ctx.supabase.rpc("update_fulfillment", {
    p_org: ctx.org.id, p_order: orderId, p_to: p.data.to, p_tracking: p.data.tracking || null,
  });
  if (error) return { error: friendlyDbError(error) };

  if (p.data.to === "shipped" && detail.order.customer_email) {
    try {
      const { data: store } = await ctx.supabase.from("stores").select("slug, name").eq("organization_id", ctx.org.id).maybeSingle();
      if (store) {
        await sendOrderShipped({
          order_number: detail.order.order_number, customer_email: detail.order.customer_email, customer_name: detail.order.customer_name,
          total_cents: detail.order.total_cents, currency: detail.order.currency, store_name: store.name, store_slug: store.slug,
          tracking_number: p.data.tracking || null,
          lines: detail.items.map((i) => ({ name: i.product_name, variant: i.variant_label, quantity: i.quantity, unit_price_cents: i.unit_price_cents })),
        });
      }
    } catch (e) {
      console.error("shipping notification failed", e instanceof Error ? e.message : e); // the order update already succeeded
    }
  }
  return done(ctx.org.slug, orderId);
}

export async function cancelOrderAction(orgSlug: string, orderId: string): Promise<Result> {
  const { ctx } = await load(orgSlug, orderId);
  if (!hasRole(ctx.role, "manager")) return { error: "You need manager access to cancel orders." };
  const { error } = await ctx.supabase.rpc("cancel_order", { p_org: ctx.org.id, p_order: orderId });
  if (error) return { error: friendlyDbError(error) };
  return done(ctx.org.slug, orderId);
}

/**
 * Refund order: authorize and validate EVERYTHING before touching Stripe, because a refund cannot be undone.
 * The Stripe call uses a deterministic idempotency key, so retrying after a failed database write re-uses
 * the same refund and then records it.
 */
export async function refundOrderAction(orgSlug: string, orderId: string, values: RefundFormValues): Promise<Result> {
  const p = refundFormSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { ctx, detail } = await load(orgSlug, orderId);
  if (!hasRole(ctx.role, "manager")) return { error: "You need manager access to issue refunds." };
  if (!detail) return { error: "Order not found." };
  if (!isStripeConfigured()) return { error: "Stripe isn't configured, so refunds can't be issued." };

  const o = detail.order;
  const payment = detail.payments[0];
  if (!["paid", "partially_refunded"].includes(o.payment_status) || !payment?.stripe_payment_intent) {
    return { error: "This order has no Stripe payment to refund." };
  }
  const cents = toCents(p.data.amount);
  const remaining = o.total_cents - o.refunded_cents;
  if (cents <= 0 || cents > remaining) return { error: "The refund can't exceed the remaining amount." };
  if (p.data.restock && (cents !== remaining || o.fulfillment_status !== "unfulfilled")) {
    return { error: "Restocking requires refunding the full remaining amount on an order that hasn't shipped." };
  }

  let refundId: string;
  try {
    const refund = await getStripe().refunds.create(
      { payment_intent: payment.stripe_payment_intent, amount: cents, reason: "requested_by_customer", metadata: { order_id: orderId } },
      { idempotencyKey: `refund-${orderId}-${o.refunded_cents}-${cents}` },
    );
    refundId = refund.id;
  } catch (e) {
    console.error("stripe refund failed", orderId, e instanceof Error ? e.message : e);
    return { error: "Stripe couldn't process the refund. Nothing was changed." };
  }

  const { error } = await ctx.supabase.rpc("record_refund", {
    p_org: ctx.org.id, p_order: orderId, p_amount: cents, p_stripe_refund: refundId,
    p_reason: p.data.reason || null, p_restock: p.data.restock,
  });
  if (error) {
    console.error("refund issued in Stripe but not recorded", orderId, refundId, error.message);
    return { error: "The refund was issued in Stripe but couldn't be recorded here. Try again to record it; it won't be charged twice." };
  }
  return done(ctx.org.slug, orderId);
}
