import { sendOrderConfirmation } from "@/lib/order-notify";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { processStripeWebhook } from "@/lib/stripe-webhook";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !isStripeConfigured() || !isAdminConfigured()) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const raw = await req.text(); // the signature covers the exact raw bytes: never parse before verifying
  const stripe = getStripe();
  const admin = createAdminClient();
  const res = await processStripeWebhook(
    raw,
    req.headers.get("stripe-signature"),
    (body, sig) => stripe.webhooks.constructEvent(body, sig, secret),
    {
      rpc: async (fn, args) => {
        const { data, error } = await admin.rpc(fn, args);
        return { data, error };
      },
      onConfirmed: (order) => sendOrderConfirmation(order),
    },
  );
  return Response.json(res.body, { status: res.status });
}
