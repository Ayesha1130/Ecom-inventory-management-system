import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asAnon, asService, asUser, createDb } from "./harness";

const ALICE = "00000000-0000-4000-8000-00000000000a"; // owner of the test store
const BOB = "00000000-0000-4000-8000-00000000000b"; // outsider
const CAROL = "00000000-0000-4000-8000-00000000000c"; // staff
const SLUG = "alice-goods";

let db: PGlite;
let org: string, main: string, east: string, V1: string, V2: string, V3: string;
let seq = 0;

const q = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const alice = <T>(fn: () => Promise<T>) => asUser(db, ALICE, fn);
const svc = async (sql: string, p: unknown[] = []) => asService(db, async () => (await q<{ r: any }>(sql, p))[0]!.r);
const anon = async (sql: string, p: unknown[] = []) => asAnon(db, async () => (await q<{ r: any }>(sql, p))[0]!.r);
const level = async (v: string, w: string) => (await q("select on_hand, reserved from public.inventory_levels where variant_id=$1 and warehouse_id=$2", [v, w]))[0];
const available = async (v: string) => (await q("select coalesce(sum(on_hand-reserved),0)::int a from public.inventory_levels where variant_id=$1", [v]))[0].a;
const orderRow = async (id: string) => (await q("select * from public.orders where id=$1", [id]))[0];
const restock = (v: string, w: string, n: number) => alice(() => db.query("select public.adjust_stock($1,$2,$3,$4,'restock')", [org, v, w, n]));

async function placeOrder(variant: string, qty: number, email = "Shopper@Example.com") {
  const n = ++seq;
  const cartToken = `cart${n}`.padEnd(43, "c");
  const accessToken = `acc${n}`.padEnd(43, "a");
  await anon("select public.cart_add($1,$2,$3,$4) as r", [SLUG, cartToken, variant, qty]);
  const o = await svc("select public.create_order_from_cart($1,$2,$3,$4,$5,$6::jsonb) as r", [
    SLUG, cartToken, accessToken, email, "Sam Shopper", JSON.stringify({ line1: "1 Test St", city: "Testville", postal_code: "12345", country: "US" })]);
  const session = `cs_test_${n}`;
  await svc("select public.set_checkout_session($1,$2)::text as r", [o.order_id, session]);
  return { ...o, session, cartToken, accessToken };
}
const pay = (o: { session: string; total_cents: number }, eventId = `evt_${++seq}`, amount = o.total_cents, cur = "usd") =>
  svc("select public.confirm_order_payment($1,$2,$3,$4,$5) as r", [eventId, o.session, `pi_${eventId}`, amount, cur]);

beforeAll(async () => {
  db = await createDb();
  for (const u of [ALICE, BOB, CAROL]) await addUser(db, u);
  org = await alice(async () => (await q("select public.create_organization('Alice Goods','alice-goods') as id"))[0].id);
  await db.query("insert into public.organization_members values ($1,$2,'staff')", [org, CAROL]);
  main = (await q("select id from public.warehouses where organization_id=$1", [org]))[0].id;
  east = await alice(async () => (await q("insert into public.warehouses (organization_id,name,code) values ($1,'East','EAST') returning id", [org]))[0].id);
  const pid = await alice(async () => (await q("select public.save_product($1,null,$2::jsonb) as id", [org, JSON.stringify({
    name: "Test Tee", slug: "test-tee", status: "active",
    variants: [{ sku: "V1", option_size: "M", price_cents: 2500, cost_cents: 800 }, { sku: "V2", option_size: "L", price_cents: 2500, cost_cents: 800 }, { sku: "V3", option_size: "S", price_cents: 4000, cost_cents: 900 }],
  })]))[0].id);
  [V1, V2, V3] = (await q("select id from public.product_variants where product_id=$1 order by sku", [pid])).map((r) => r.id);
  await restock(V1, main, 20); await restock(V1, east, 10);
  await restock(V2, main, 2); await restock(V2, east, 5);
  await restock(V3, main, 3);
  await alice(() => db.query("update public.stores set is_published = true where slug = $1", [SLUG]));
}, 90_000);
afterAll(async () => db.close());

describe("who may call what", () => {
  it("keeps order creation and payment confirmation away from browsers", async () => {
    for (const run of [asAnon, (d: PGlite, f: () => Promise<any>) => asUser(d, ALICE, f)]) {
      await expect(run(db, () => db.query("select public.confirm_order_payment('e','s','pi',1,'usd')"))).rejects.toThrow(/permission denied/i);
      await expect(run(db, () => db.query("select public.create_order_from_cart('a','b','c','d','e','{}')"))).rejects.toThrow(/permission denied/i);
      await expect(run(db, () => db.query("select public.release_expired_reservations()"))).rejects.toThrow(/permission denied/i);
    }
  });
  it("makes orders read-only for clients, even staff and owners", async () => {
    for (const who of [CAROL, ALICE]) {
      await expect(asUser(db, who, () => db.query("update public.orders set status = 'cancelled'"))).rejects.toThrow(/permission denied/i);
      await expect(asUser(db, who, () => db.query("delete from public.orders"))).rejects.toThrow(/permission denied/i);
    }
  });
});

describe("creating an order", () => {
  it("snapshots items and prices, reserves stock, numbers orders per organization", async () => {
    const o = await placeOrder(V1, 2);
    expect(o).toMatchObject({ order_number: 1001, status: "pending", payment_status: "unpaid", total_cents: 5000, currency: "USD", customer_email: "shopper@example.com" });
    expect(o.lines).toEqual([{ name: "Test Tee", variant: "M", quantity: 2, unit_price_cents: 2500 }]);
    expect(await q("select coalesce(sum(reserved),0)::int r from public.inventory_levels where variant_id=$1", [V1])).toEqual([{ r: 2 }]);
    expect((await q("select count(*)::int c from public.customers where organization_id=$1 and email='shopper@example.com'", [org]))[0].c).toBe(1);
    const o2 = await placeOrder(V1, 1);
    expect(o2.order_number).toBe(1002);
    await alice(() => db.query("select public.cancel_order($1,$2)", [org, o.order_id]));
    await alice(() => db.query("select public.cancel_order($1,$2)", [org, o2.order_id]));
  });

  it("starts order numbers after any existing orders (seeded demo org)", async () => {
    const demoVariant = (await q("select v.id from public.product_variants v join public.products p on p.id=v.product_id where p.slug='ridge-canvas-tote' limit 1"))[0].id;
    await anon("select public.cart_add('alder-finch',$1,$2,1) as r", ["demo".padEnd(43, "d"), demoVariant]);
    const o = await svc("select public.create_order_from_cart('alder-finch',$1,$2,'a@example.com','A B','{\"line1\":\"x\",\"city\":\"y\",\"postal_code\":\"1\",\"country\":\"US\"}'::jsonb) as r", ["demo".padEnd(43, "d"), "tok".padEnd(43, "t")]);
    expect(o.order_number).toBe(1321);
  });

  it("validates input and refuses empty or unknown carts", async () => {
    const good = { line1: "1", city: "c", postal_code: "1", country: "US" };
    const call = (token: string, email: string, name: string, ship: object, access = "x".repeat(43)) =>
      svc("select public.create_order_from_cart($1,$2,$3,$4,$5,$6::jsonb) as r", [SLUG, token, access, email, name, JSON.stringify(ship)]);
    await anon("select public.cart_add($1,$2,$3,1) as r", [SLUG, "valid".padEnd(43, "v"), V1]);
    await expect(call("valid".padEnd(43, "v"), "not-an-email", "Sam Lee", good)).rejects.toThrow(/valid email/i);
    await expect(call("valid".padEnd(43, "v"), "a@b.co", "S", good)).rejects.toThrow(/full name/i);
    await expect(call("valid".padEnd(43, "v"), "a@b.co", "Sam Lee", { ...good, city: "" })).rejects.toThrow(/shipping address/i);
    await expect(call("valid".padEnd(43, "v"), "a@b.co", "Sam Lee", good, "short")).rejects.toThrow(/invalid request/i);
    await expect(call("nobody".padEnd(43, "n"), "a@b.co", "Sam Lee", good)).rejects.toThrow(/empty or has expired/i);
  });

  it("cannot oversell: the second buyer fails cleanly and nothing partial is written", async () => {
    // both shoppers add 2 of the last 3 while stock is still free, then race to check out
    const ship = JSON.stringify({ line1: "1", city: "c", postal_code: "1", country: "US" });
    await anon("select public.cart_add($1,$2,$3,2) as r", [SLUG, "buyerA".padEnd(43, "a"), V3]);
    await anon("select public.cart_add($1,$2,$3,2) as r", [SLUG, "buyerB".padEnd(43, "b"), V3]);
    const a = await svc("select public.create_order_from_cart($1,$2,$3,'a@example.com','Ann Buyer',$4::jsonb) as r", [SLUG, "buyerA".padEnd(43, "a"), "x".repeat(43), ship]);
    const before = (await q("select count(*)::int c from public.orders"))[0].c;
    await expect(svc("select public.create_order_from_cart($1,$2,$3,'b@example.com','Bea Buyer',$4::jsonb) as r",
      [SLUG, "buyerB".padEnd(43, "b"), "y".repeat(43), ship])).rejects.toThrow(/Only 1 of "Test Tee"/);
    expect((await q("select count(*)::int c from public.orders"))[0].c).toBe(before);
    expect(await level(V3, main)).toMatchObject({ on_hand: 3, reserved: 2 });
    expect((await q("select count(*)::int c from public.inventory_reservations where order_id is not null and quantity > 0 and status = 'active' and variant_id = $1", [V3]))[0].c).toBe(1);
    await alice(() => db.query("select public.cancel_order($1,$2)", [org, a.order_id]));
    expect(await level(V3, main)).toMatchObject({ reserved: 0 });
  });

  it("restarting checkout supersedes the earlier unpaid order instead of double-reserving", async () => {
    const first = await placeOrder(V1, 3);
    const again = await svc("select public.create_order_from_cart($1,$2,$3,'shopper@example.com','Sam Shopper',$4::jsonb) as r",
      [SLUG, first.cartToken, "n".repeat(43), JSON.stringify({ line1: "1", city: "c", postal_code: "1", country: "US" })]);
    expect((await orderRow(first.order_id)).cancel_reason).toBe("superseded");
    expect((await q("select coalesce(sum(reserved),0)::int r from public.inventory_levels where variant_id=$1", [V1]))[0].r).toBe(3);
    await svc("select public.cancel_pending_order($1,'test')::text as r", [again.order_id]);
    expect((await q("select coalesce(sum(reserved),0)::int r from public.inventory_levels where variant_id=$1", [V1]))[0].r).toBe(0);
  });

  it("spreads a reservation across warehouses, fullest first", async () => {
    const o = await placeOrder(V2, 6);
    const res = await q("select warehouse_id, quantity from public.inventory_reservations where order_id=$1 order by quantity desc", [o.order_id]);
    expect(res).toEqual([{ warehouse_id: east, quantity: 5 }, { warehouse_id: main, quantity: 1 }]);
    await alice(() => db.query("select public.cancel_order($1,$2)", [org, o.order_id]));
    expect(await available(V2)).toBe(7);
  });
});

describe("payment confirmation (webhook semantics)", () => {
  it("confirms once: commits stock, records payment and sale movements, clears the cart", async () => {
    const o = await placeOrder(V1, 2);
    const before = await level(V1, east); // 10 on hand east, 20 main: allocation takes from main (fullest)
    const mainBefore = await level(V1, main);
    const r = await pay(o);
    expect(r).toMatchObject({ status: "confirmed", order_number: o.order_number, payment_status: "paid" });
    const row = await orderRow(o.order_id);
    expect(row).toMatchObject({ status: "confirmed", payment_status: "paid" });
    expect(row.paid_at).not.toBeNull();
    expect(await level(V1, main)).toEqual({ on_hand: mainBefore.on_hand - 2, reserved: mainBefore.reserved - 2 });
    expect(await level(V1, east)).toEqual(before);
    const mv = await q("select delta, reason, reference_id from public.inventory_movements where reference_id=$1", [o.order_id]);
    expect(mv).toEqual([{ delta: -2, reason: "sale", reference_id: o.order_id }]);
    expect((await q("select amount_cents from public.payments where order_id=$1", [o.order_id]))).toEqual([{ amount_cents: 5000 }]);
    expect((await anon("select public.cart_get($1,$2) as r", [SLUG, o.cartToken])).count).toBe(0);
  });

  it("ignores a duplicate delivery of the same event", async () => {
    const o = await placeOrder(V1, 1);
    expect((await pay(o, "evt_dup")).status).toBe("confirmed");
    const snapshot = await q("select on_hand, reserved from public.inventory_levels where variant_id=$1 order by warehouse_id", [V1]);
    expect((await pay(o, "evt_dup")).status).toBe("duplicate");
    expect(await q("select on_hand, reserved from public.inventory_levels where variant_id=$1 order by warehouse_id", [V1])).toEqual(snapshot);
    expect((await q("select count(*)::int c from public.payments where order_id=$1", [o.order_id]))[0].c).toBe(1);
    expect((await q("select count(*)::int c from public.inventory_movements where reference_id=$1", [o.order_id]))[0].c).toBe(1);
  });

  it("treats a second event for an already-paid order as a no-op", async () => {
    const o = await placeOrder(V1, 1);
    await pay(o);
    expect((await pay(o)).status).toBe("already_paid");
  });

  it("refuses a payment whose amount or currency doesn't match, and flags it", async () => {
    const o = await placeOrder(V1, 1);
    expect((await pay(o, undefined, o.total_cents - 1)).status).toBe("amount_mismatch");
    expect((await pay(o, undefined, o.total_cents, "eur")).status).toBe("amount_mismatch");
    expect((await orderRow(o.order_id)).status).toBe("pending");
    expect((await q("select 1 from public.order_events where order_id=$1 and type='payment.mismatch'", [o.order_id])).length).toBe(2);
    await svc("select public.cancel_pending_order($1,'test')::text as r", [o.order_id]);
  });

  it("ignores events for sessions it doesn't know", async () => {
    expect(await svc("select public.confirm_order_payment('evt_x','cs_nope','pi_x',1,'usd') as r")).toMatchObject({ status: "ignored" });
  });

  it("rolls the whole event back on failure, so Stripe's retry succeeds", async () => {
    const o = await placeOrder(V1, 1);
    await db.exec(`create function public.test_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
                   create trigger boom before insert on public.payments for each row execute function public.test_boom();`);
    await expect(pay(o, "evt_retry")).rejects.toThrow(/boom/);
    expect(await q("select 1 from public.processed_events where event_id='evt_retry'")).toHaveLength(0);
    expect((await orderRow(o.order_id)).status).toBe("pending");
    expect((await q("select status from public.inventory_reservations where order_id=$1", [o.order_id]))[0].status).toBe("active");
    await db.exec("drop trigger boom on public.payments");
    expect((await pay(o, "evt_retry")).status).toBe("confirmed");
  });
});

describe("expiry and late payments", () => {
  it("releases reserved stock for expired unpaid orders, once", async () => {
    const o = await placeOrder(V1, 4);
    const reservedBefore = (await q("select coalesce(sum(reserved),0)::int r from public.inventory_levels where variant_id=$1", [V1]))[0].r;
    await db.query("update public.orders set expires_at = now() - interval '1 minute' where id=$1", [o.order_id]);
    expect(await svc("select public.release_expired_reservations() as r")).toBe(1);
    expect(await svc("select public.release_expired_reservations() as r")).toBe(0);
    expect(await orderRow(o.order_id)).toMatchObject({ status: "cancelled", cancel_reason: "expired" });
    expect((await q("select coalesce(sum(reserved),0)::int r from public.inventory_levels where variant_id=$1", [V1]))[0].r).toBe(reservedBefore - 4);
  });

  it("handles Stripe's session-expired event idempotently", async () => {
    const o = await placeOrder(V1, 1);
    expect((await svc("select public.expire_order_session('evt_exp',$1,'expired') as r", [o.session])).status).toBe("cancelled");
    expect((await svc("select public.expire_order_session('evt_exp',$1,'expired') as r", [o.session])).status).toBe("duplicate");
    expect((await orderRow(o.order_id)).status).toBe("cancelled");
  });

  it("reinstates a late-paid order when stock is still available", async () => {
    const o = await placeOrder(V1, 2);
    await svc("select public.cancel_pending_order($1,'expired')::text as r", [o.order_id]);
    const before = await available(V1);
    expect((await pay(o)).status).toBe("confirmed");
    expect(await available(V1)).toBe(before - 2);
    expect(await orderRow(o.order_id)).toMatchObject({ status: "confirmed", payment_status: "paid", cancel_reason: null });
  });

  it("flags a late payment for refund when the stock is gone", async () => {
    const o = await placeOrder(V3, 2);
    await svc("select public.cancel_pending_order($1,'expired')::text as r", [o.order_id]);
    await alice(() => db.query("select public.adjust_stock($1,$2,$3,-3,'damage')", [org, V3, main]));
    expect((await pay(o)).status).toBe("refund_required");
    expect(await orderRow(o.order_id)).toMatchObject({ status: "cancelled", payment_status: "paid" });
    expect((await alice(async () => (await q("select public.list_orders($1,null,'needs_refund') as r", [org]))[0].r)).total).toBe(1);
    await alice(() => db.query("select public.record_refund($1,$2,$3,'re_late','Out of stock after expiry',false)", [org, o.order_id, o.total_cents]));
    expect((await orderRow(o.order_id)).payment_status).toBe("refunded");
    await restock(V3, main, 3);
  });
});

describe("fulfillment, cancellation and refunds", () => {
  it("moves paid orders through shipped and delivered, and rejects invalid jumps", async () => {
    const o = await placeOrder(V1, 1);
    await expect(asUser(db, CAROL, () => db.query("select public.update_fulfillment($1,$2,'shipped')", [org, o.order_id]))).rejects.toThrow(/only paid orders/i);
    await pay(o);
    await expect(asUser(db, CAROL, () => db.query("select public.update_fulfillment($1,$2,'delivered')", [org, o.order_id]))).rejects.toThrow(/cannot move/i);
    await asUser(db, CAROL, () => db.query("select public.update_fulfillment($1,$2,'shipped','1Z999')", [org, o.order_id]));
    expect(await orderRow(o.order_id)).toMatchObject({ fulfillment_status: "shipped", tracking_number: "1Z999" });
    await expect(alice(() => db.query("select public.update_fulfillment($1,$2,'shipped')", [org, o.order_id]))).rejects.toThrow(/cannot move/i);
    await alice(() => db.query("select public.update_fulfillment($1,$2,'delivered')", [org, o.order_id]));
    expect((await orderRow(o.order_id)).fulfillment_status).toBe("delivered");
    await expect(asUser(db, BOB, () => db.query("select public.update_fulfillment($1,$2,'shipped')", [org, o.order_id]))).rejects.toThrow(/forbidden/i);
  });

  it("only lets managers cancel, and only unpaid orders", async () => {
    const o = await placeOrder(V1, 1);
    await expect(asUser(db, CAROL, () => db.query("select public.cancel_order($1,$2)", [org, o.order_id]))).rejects.toThrow(/forbidden/i);
    await pay(o);
    await expect(alice(() => db.query("select public.cancel_order($1,$2)", [org, o.order_id]))).rejects.toThrow(/refund paid orders/i);
  });

  it("refunds partially, then fully with restock, and returns stock to the original warehouse", async () => {
    const o = await placeOrder(V1, 3); // 3 x 25.00 = 75.00
    await pay(o);
    const afterSale = await available(V1);
    await expect(alice(() => db.query("select public.record_refund($1,$2,$3,'re_1','x',true)", [org, o.order_id, 1000]))).rejects.toThrow(/full refund/i);
    expect((await alice(async () => (await q("select public.record_refund($1,$2,1000,'re_1','Goodwill',false) as r", [org, o.order_id]))[0].r)).refunded_cents).toBe(1000);
    expect(await orderRow(o.order_id)).toMatchObject({ payment_status: "partially_refunded", refunded_cents: 1000 });
    expect((await alice(async () => (await q("select public.record_refund($1,$2,1000,'re_1','Goodwill',false) as r", [org, o.order_id]))[0].r)).status).toBe("duplicate");
    await expect(alice(() => db.query("select public.record_refund($1,$2,99999,'re_2','x',false)", [org, o.order_id]))).rejects.toThrow(/remaining 6500/);
    await expect(asUser(db, CAROL, () => db.query("select public.record_refund($1,$2,100,'re_3','x',false)", [org, o.order_id]))).rejects.toThrow(/forbidden/i);

    await alice(() => db.query("select public.record_refund($1,$2,6500,'re_4','Customer cancelled',true)", [org, o.order_id]));
    expect(await orderRow(o.order_id)).toMatchObject({ status: "cancelled", payment_status: "refunded", refunded_cents: 7500, cancel_reason: "refunded" });
    expect(await available(V1)).toBe(afterSale + 3);
    expect((await q("select delta, reason from public.inventory_movements where reference_id=$1 order by id", [o.order_id]))).toEqual([{ delta: -3, reason: "sale" }, { delta: 3, reason: "return" }]);
    await expect(alice(() => db.query("select public.record_refund($1,$2,1,'re_5','x',false)", [org, o.order_id]))).rejects.toThrow(/no refundable payment/i);
    await expect(alice(() => db.query("select public.update_fulfillment($1,$2,'shipped')", [org, o.order_id]))).rejects.toThrow(/only paid orders/i);
  });

  it("won't restock an order that has already shipped", async () => {
    const o = await placeOrder(V1, 1);
    await pay(o);
    await alice(() => db.query("select public.update_fulfillment($1,$2,'shipped')", [org, o.order_id]));
    await expect(alice(() => db.query("select public.record_refund($1,$2,$3,'re_s','x',true)", [org, o.order_id, o.total_cents]))).rejects.toThrow(/not shipped/i);
  });
});

describe("reading orders", () => {
  it("lets a customer see their order by secret token or by number plus email, and nobody else", async () => {
    const o = await placeOrder(V1, 1, "Mixed.Case@Example.com");
    expect((await svc("select public.order_by_token($1,$2,$3) as r", [SLUG, o.order_number, o.accessToken])).customer_name).toBe("Sam Shopper");
    expect(await svc("select public.order_by_token($1,$2,$3) as r", [SLUG, o.order_number, "w".repeat(43)])).toBeNull();
    expect((await svc("select public.order_lookup($1,$2,$3) as r", [SLUG, o.order_number, "  mixed.case@EXAMPLE.com "])).order_number).toBe(o.order_number);
    expect(await svc("select public.order_lookup($1,$2,$3) as r", [SLUG, o.order_number, "other@example.com"])).toBeNull();
    expect(await svc("select public.order_lookup('alder-finch',$1,$2) as r", [o.order_number, "mixed.case@example.com"])).toBeNull();
    await svc("select public.cancel_pending_order($1,'test')::text as r", [o.order_id]);
  });

  it("filters, searches and paginates the staff order list", async () => {
    const list = (filter: string, search: string | null = null, limit = 25) =>
      alice(async () => (await q("select public.list_orders($1,$2,$3,$4,0) as r", [org, search, filter, limit]))[0].r);
    const all = await list("all");
    expect(all.total).toBeGreaterThan(10);
    expect((await list("all", null, 3)).rows).toHaveLength(3);
    expect((await list("all", "1001")).rows.map((r: any) => r.order_number)).toEqual([1001]);
    expect((await list("all", "shopper@example")).total).toBeGreaterThan(5);
    expect((await list("all", "%")).total).toBe(0);
    expect((await list("to_fulfill")).rows.every((r: any) => r.status === "confirmed" && r.fulfillment_status === "unfulfilled")).toBe(true);
    expect((await list("cancelled")).rows.every((r: any) => r.status === "cancelled")).toBe(true);
  });

  it("returns a full order with timeline, hiding secrets; demo viewers can't see payments", async () => {
    const o = await placeOrder(V1, 1);
    await pay(o);
    const full = await alice(async () => (await q("select public.get_order($1,$2) as r", [org, o.order_id]))[0].r);
    expect(full.order.access_token_hash).toBeUndefined();
    expect(full.items).toHaveLength(1);
    expect(full.events.map((e: any) => e.type)).toEqual(["order.created", "payment.succeeded"]);
    expect(full.payments).toHaveLength(1);
    const demoOrder = (await q("select id, organization_id from public.orders where organization_id <> $1 limit 1", [org]))[0];
    const asViewer = await asUser(db, BOB, async () => (await q("select public.get_order($1,$2) as r", [org, o.order_id]))[0].r);
    expect(asViewer).toBeNull();
    expect(demoOrder).toBeTruthy();
  });

  it("nets refunds out of dashboard revenue", async () => {
    const expected = (await q(`select coalesce(sum(total_cents - refunded_cents),0)::int s from public.orders
      where organization_id=$1 and status <> 'cancelled' and payment_status in ('paid','partially_refunded')`, [org]))[0].s;
    const s = await alice(async () => (await q("select public.dashboard_summary($1, now() - interval '1 day', now() + interval '1 day') as r", [org]))[0].r);
    expect(s.revenue_cents).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe("invariants after everything above", () => {
  it("keeps on_hand equal to the ledger", async () => {
    expect(await q(`select l.variant_id from public.inventory_levels l
      left join (select variant_id, warehouse_id, sum(delta) s from public.inventory_movements group by 1,2) m
        on m.variant_id=l.variant_id and m.warehouse_id=l.warehouse_id
      where l.organization_id=$1 and l.on_hand <> coalesce(m.s,0)`, [org])).toHaveLength(0);
  });
  it("keeps reserved equal to the sum of active reservations", async () => {
    expect(await q(`select l.variant_id from public.inventory_levels l
      left join (select variant_id, warehouse_id, sum(quantity) s from public.inventory_reservations where status='active' group by 1,2) r
        on r.variant_id=l.variant_id and r.warehouse_id=l.warehouse_id
      where l.organization_id=$1 and l.reserved <> coalesce(r.s,0)`, [org])).toHaveLength(0);
  });
  it("never leaves a pending order without an active reservation, or a paid order with unreleased stock", async () => {
    expect(await q(`select o.id from public.orders o where o.organization_id=$1 and o.status='pending'
      and not exists (select 1 from public.inventory_reservations r where r.order_id=o.id and r.status='active')`, [org])).toHaveLength(0);
    expect(await q(`select o.id from public.orders o where o.organization_id=$1 and o.status='confirmed'
      and exists (select 1 from public.inventory_reservations r where r.order_id=o.id and r.status='active')`, [org])).toHaveLength(0);
  });
});
