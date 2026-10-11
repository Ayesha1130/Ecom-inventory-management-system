"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";
import { rateLimit } from "@/lib/rate-limit";
import { getSiteOrigin } from "@/lib/site";
import { STORE_SLUG_RE, TOKEN_RE, cartCookieName, newCartToken } from "@/lib/store";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { checkoutSchema, type CheckoutValues } from "@/lib/validators/checkout";
import { createdOrderSchema } from "@/lib/validators/orders";

/**
 * Creates the order and reserves stock in one database transaction, then hands off to Stripe Checkout.
 * Amounts always come from the database (current prices), never from the browser.
 */
export async function startCheckoutAction(slug: string, values: CheckoutValues): Promise<{ error: string } | undefined> {
  if (slug.length < 3 || slug.length > 40 || !STORE_SLUG_RE.test(slug)) return { error: "Store not found." };
  const parsed = checkoutSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  if (!isStripeConfigured() || !isAdminConfigured()) return { error: "Payments aren't configured for this deployment." };

  const limited = await rateLimit("checkout", 10, 600);
  if (!limited.ok) return { error: limited.message };

  const token = (await cookies()).get(cartCookieName(slug))?.value;
  if (!token || !TOKEN_RE.test(token)) return { error: "Your cart is empty or has expired." };

  const admin = createAdminClient();
  const accessToken = newCartToken(); // proves ownership of the order on the confirmation page
  const v = parsed.data;
  const { data, error } = await admin.rpc("create_order_from_cart", {
    p_store: slug, p_token: token, p_access_token: accessToken, p_email: v.email, p_name: v.name,
    p_shipping: { line1: v.line1, line2: v.line2 || null, city: v.city, region: v.region || null, postal_code: v.postal_code, country: v.country },
  });
  if (error) return { error: friendlyDbError(error) };
  const order = createdOrderSchema.parse(data);

  let sessionId: string | undefined;
  let url: string;
  try {
    const stripe = getStripe();
    const origin = await getSiteOrigin();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: order.order_id,
        customer_email: order.customer_email ?? undefined,
        line_items: order.lines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: l.unit_price_cents,
            product_data: { name: l.variant ? `${l.name} (${l.variant})` : l.name },
          },
        })),
        metadata: { order_id: order.order_id, order_number: String(order.order_number) },
        // Stripe requires >= 30 minutes; the database reservation lasts 35, so any payment inside the session is covered
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${origin}/s/${slug}/order/${order.order_number}?t=${accessToken}`,
        cancel_url: `${origin}/s/${slug}/cart`,
      },
      { idempotencyKey: `checkout-${order.order_id}` },
    );
    sessionId = session.id;
    if (!session.url) throw new Error("Stripe returned no checkout URL");
    const { error: attachErr } = await admin.rpc("set_checkout_session", { p_order: order.order_id, p_session: session.id });
    if (attachErr) throw new Error("Could not attach the session to the order");
    url = session.url;
  } catch (e) {
    console.error("checkout start failed", order.order_id, e instanceof Error ? e.message : e);
    // never leave a payable session without an order, or stock held for an order nobody can pay
    if (sessionId) await getStripe().checkout.sessions.expire(sessionId).catch(() => undefined);
    await admin.rpc("cancel_pending_order", { p_order: order.order_id, p_reason: "checkout_failed" });
    return { error: "We couldn't start the payment. Please try again." };
  }
  redirect(url);
}
