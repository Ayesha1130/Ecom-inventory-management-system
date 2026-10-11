import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { processStripeWebhook, type ConfirmedOrder, type Rpc } from "@/lib/stripe-webhook";
import { orderConfirmationEmail, orderShippedEmail, escapeHtml } from "@/lib/emails";
import { checkoutSchema } from "@/lib/validators/checkout";
import { asAnon, asService, createDb } from "./db/harness";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");
let db: PGlite;
let variant: string;
let n = 0;

const q = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;

/** Forwards supabase-style rpc(fn, args) to the real SQL functions, as service_role, using named arguments. */
const rpc: Rpc = async (fn, args) => {
  if (!/^[a-z_]+$/.test(fn)) throw new Error("bad function name");
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  try {
    const rows = await asService(db, async () => (await db.query<{ r: unknown }>(sql, keys.map((k) => args[k]))).rows);
    return { data: rows[0]?.r ?? null, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } };
  }
};

const confirmed: ConfirmedOrder[] = [];
const deps = { rpc, onConfirmed: async (o: ConfirmedOrder) => void confirmed.push(o) };
const verify = (body: string, sig: string) => stripe.webhooks.constructEvent(body, sig, SECRET);

async function newOrder(qty = 2) {
  const i = ++n;
  const cart = `wh${i}`.padEnd(43, "w");
  await asAnon(db, () => db.query("select public.cart_add('alder-finch',$1,$2,$3)", [cart, variant, qty]));
  const o = (await asService(db, async () => (await q("select public.create_order_from_cart('alder-finch',$1,$2,'wh@example.com','Web Hook',$3::jsonb) as r",
    [cart, `acc${i}`.padEnd(43, "a"), JSON.stringify({ line1: "1", city: "c", postal_code: "1", country: "US" })]))[0].r));
  const session = `cs_test_wh${i}`;
  await asService(db, () => db.query("select public.set_checkout_session($1,$2)", [o.order_id, session]));
  return { ...o, session } as { order_id: string; order_number: number; total_cents: number; session: string };
}

const event = (id: string, type: string, object: Record<string, unknown>) =>
  ({ id, object: "event", type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object } }) as unknown as Stripe.Event;
const session = (o: { session: string; total_cents: number }, extra: Record<string, unknown> = {}) =>
  ({ id: o.session, object: "checkout.session", payment_status: "paid", payment_intent: `pi_${o.session}`, amount_total: o.total_cents, currency: "usd", ...extra });
const deliver = (e: Stripe.Event, opts: { secret?: string; timestamp?: number; body?: string } = {}) => {
  const payload = JSON.stringify(e);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET, timestamp: opts.timestamp });
  return processStripeWebhook(opts.body ?? payload, header, verify, deps);
};
const state = async (orderId: string) =>
  (await q(`select o.status, o.payment_status,
     (select coalesce(sum(on_hand),0)::int from public.inventory_levels where variant_id=$2) as on_hand,
     (select coalesce(sum(reserved),0)::int from public.inventory_levels where variant_id=$2) as reserved,
     (select count(*)::int from public.payments where order_id=o.id) as payments
     from public.orders o where o.id=$1`, [orderId, variant]))[0];

beforeAll(async () => {
  db = await createDb();
  variant = (await q("select v.id from public.product_variants v join public.products p on p.id=v.product_id where p.slug='ridge-canvas-tote' order by v.sku limit 1"))[0].id;
}, 60_000);
afterAll(async () => db.close());

describe("signature verification", () => {
  it("rejects missing, forged, tampered and replayed requests without touching the database", async () => {
    const o = await newOrder();
    const before = await state(o.order_id);
    const evt = event("evt_sig", "checkout.session.completed", session(o));
    expect((await processStripeWebhook(JSON.stringify(evt), null, verify, deps)).status).toBe(400);
    expect((await deliver(evt, { secret: "whsec_wrong" })).status).toBe(400);
    expect((await deliver(evt, { body: JSON.stringify({ ...evt, id: "evt_other" }) })).status).toBe(400); // signed A, sent B
    expect((await deliver(evt, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400); // replay window
    expect(await state(o.order_id)).toEqual(before);
    expect((await q("select 1 from public.processed_events where event_id='evt_sig'")).length).toBe(0);
    await asService(db, () => db.query("select public.cancel_pending_order($1,'test')", [o.order_id]));
  });
});

describe("payment events", () => {
  it("confirms an order once and sends one notification, even if Stripe delivers the event repeatedly", async () => {
    const o = await newOrder(2);
    const start = await state(o.order_id);
    const evt = event("evt_pay_1", "checkout.session.completed", session(o));

    const first = await deliver(evt);
    expect(first).toMatchObject({ status: 200, body: { received: true, handled: true, result: "confirmed" } });
    const afterFirst = await state(o.order_id);
    expect(afterFirst).toEqual({ status: "confirmed", payment_status: "paid", on_hand: start.on_hand - 2, reserved: start.reserved - 2, payments: 1 });
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ order_number: o.order_number, customer_email: "wh@example.com", store_slug: "alder-finch" });

    for (let i = 0; i < 3; i++) expect((await deliver(evt)).body).toMatchObject({ result: "duplicate" });
    expect(await state(o.order_id)).toEqual(afterFirst);
    expect(confirmed).toHaveLength(1);
  });

  it("waits for delayed payment methods, then confirms on async success", async () => {
    const o = await newOrder(1);
    const r1 = await deliver(event("evt_async_1", "checkout.session.completed", session(o, { payment_status: "unpaid" })));
    expect(r1.body).toMatchObject({ handled: false, result: "awaiting_payment" });
    expect((await state(o.order_id)).status).toBe("pending");
    const r2 = await deliver(event("evt_async_2", "checkout.session.async_payment_succeeded", session(o)));
    expect(r2.body).toMatchObject({ result: "confirmed" });
    expect((await state(o.order_id)).status).toBe("confirmed");
  });

  it("does not confirm when the paid amount doesn't match the order", async () => {
    const o = await newOrder(1);
    const r = await deliver(event("evt_bad_amt", "checkout.session.completed", session(o, { amount_total: o.total_cents - 100 })));
    expect(r.body).toMatchObject({ result: "amount_mismatch" });
    expect((await state(o.order_id)).status).toBe("pending");
    await asService(db, () => db.query("select public.cancel_pending_order($1,'test')", [o.order_id]));
  });

  it("releases stock when Stripe says the session expired, and ignores a repeat", async () => {
    const o = await newOrder(3);
    const held = await state(o.order_id);
    const evt = event("evt_expired", "checkout.session.expired", { id: o.session, object: "checkout.session" });
    expect((await deliver(evt)).body).toMatchObject({ result: "cancelled" });
    expect(await state(o.order_id)).toMatchObject({ status: "cancelled", reserved: held.reserved - 3 });
    expect((await deliver(evt)).body).toMatchObject({ result: "duplicate" });
  });

  it("acknowledges unrelated event types without doing anything", async () => {
    const r = await deliver(event("evt_other", "customer.created", { id: "cus_1" }));
    expect(r).toMatchObject({ status: 200, body: { handled: false, result: "ignored" } });
  });
});

describe("failure handling", () => {
  it("returns 500 so Stripe retries when the database call fails", async () => {
    const failing = { rpc: async () => ({ data: null, error: { message: "connection reset" } }) };
    const evt = event("evt_500", "checkout.session.completed", { id: "cs_x", object: "checkout.session", payment_status: "paid", payment_intent: "pi_x", amount_total: 100, currency: "usd" });
    const payload = JSON.stringify(evt);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await processStripeWebhook(payload, stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }), verify, failing);
    spy.mockRestore();
    expect(res.status).toBe(500);
  });

  it("does not fail the webhook if the confirmation email throws", async () => {
    const o = await newOrder(1);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const payload = JSON.stringify(event("evt_mail_fail", "checkout.session.completed", session(o)));
    const res = await processStripeWebhook(payload, stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }), verify,
      { rpc, onConfirmed: async () => { throw new Error("smtp down"); } });
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect((await state(o.order_id)).status).toBe("confirmed");
  });
});

describe("emails and checkout input", () => {
  const order = { order_number: 1042, customer_name: "<img/src/onerror=alert(1)> Sam", total_cents: 5000, currency: "USD", store_name: "Alder & Finch",
    lines: [{ name: "Tote <b>", variant: "Sand", quantity: 2, unit_price_cents: 2500 }], trackUrl: "https://shop.test/s/x/track?order=1042" };
  it("escapes customer- and merchant-supplied text in HTML", () => {
    const { html, subject } = orderConfirmationEmail(order);
    expect(subject).toBe("Order #1042 confirmed");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img/src/onerror=alert(1)&gt;");
    expect(html).not.toContain("Tote <b>");
    expect(html).toContain("Tote &lt;b&gt;");
    expect(html).toContain("Alder &amp; Finch");
    expect(orderShippedEmail({ ...order, tracking_number: "1Z <x>" }).html).not.toContain("<x>");
    expect(escapeHtml(`"&'<>`)).toBe("&quot;&amp;&#39;&lt;&gt;");
  });
  it("validates checkout details", () => {
    const ok = { email: " Sam@Example.com ", name: "Sam Lee", line1: "1 Main St", line2: "", city: "Town", region: "", postal_code: "12345", country: "US" };
    expect(checkoutSchema.parse(ok).email).toBe("sam@example.com");
    expect(checkoutSchema.safeParse({ ...ok, country: "ZZ" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...ok, line1: "" }).success).toBe(false);
  });
});
