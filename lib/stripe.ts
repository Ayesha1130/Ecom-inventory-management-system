import Stripe from "stripe";

/** Stripe is optional: without keys the storefront still works and checkout says it isn't configured. */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && (key.startsWith("sk_test_") || process.env.STRIPE_ALLOW_LIVE === "true");
}

let client: Stripe | undefined;
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  // This is a portfolio project: refuse live keys unless explicitly allowed.
  if (!key.startsWith("sk_test_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("Refusing to use a live Stripe key. Use a test-mode key (sk_test_...).");
  }
  return (client ??= new Stripe(key));
}
