import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb } from "./harness";

const ALICE = "00000000-0000-4000-8000-00000000000a"; // owner
const BOB = "00000000-0000-4000-8000-00000000000b"; // outsider
const CAROL = "00000000-0000-4000-8000-00000000000c"; // staff
const ANON = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let org: string, demo: string, main: string, east: string, V1: string, V2: string, supplier: string;

const q = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const as = (who: string, opts = {}) => <T>(fn: () => Promise<T>) => asUser(db, who, fn, opts);
const alice = as(ALICE), carol = as(CAROL), bob = as(BOB);
const demoRead = async (sql: string, p: unknown[] = []) => asUser(db, ANON, async () => (await q<{ r: any }>(sql, p))[0]!.r, { anonymous: true });
const aliceCall = async (sql: string, p: unknown[] = []) => alice(async () => (await q<{ r: any }>(sql, p))[0]!.r);
const onHand = async (v: string, w: string) => (await q("select on_hand from public.inventory_levels where variant_id=$1 and warehouse_id=$2", [v, w]))[0]?.on_hand ?? 0;

beforeAll(async () => {
  db = await createDb();
  for (const [id, email] of [[ALICE, "alice@example.com"], [BOB, "bob@example.com"], [CAROL, "carol@example.com"], [ANON, null]] as const) await addUser(db, id, email ?? undefined);
  org = await alice(async () => (await q("select public.create_organization('Alice Goods','alice-goods') as id"))[0].id);
  await db.query("insert into public.organization_members values ($1,$2,'staff')", [org, CAROL]);
  demo = (await q("select id from public.organizations where is_demo"))[0].id;
  main = (await q("select id from public.warehouses where organization_id=$1", [org]))[0].id;
  east = await alice(async () => (await q("insert into public.warehouses (organization_id,name,code) values ($1,'East','EAST') returning id", [org]))[0].id);
  const pid = await alice(async () => (await q("select public.save_product($1,null,$2::jsonb) as id", [org, JSON.stringify({
    name: "Ops Tee", slug: "ops-tee", status: "active",
    variants: [{ sku: "OPS-1", price_cents: 5000, cost_cents: 1000, low_stock_threshold: 5 }, { sku: "OPS-2", price_cents: 5000, cost_cents: 2000, low_stock_threshold: 5 }] })]))[0].id);
  [V1, V2] = (await q("select id from public.product_variants where product_id=$1 order by sku", [pid])).map((r) => r.id);
  await alice(() => db.query("select public.adjust_stock($1,$2,$3,10,'restock')", [org, V1, main]));
  supplier = await alice(async () => (await q("insert into public.suppliers (organization_id,name,email) values ($1,'Acme Mills','a@acme.example.com') returning id", [org]))[0].id);
}, 90_000);
afterAll(async () => db.close());

describe("customers", () => {
  it("lists with computed stats and segments that agree with the raw orders", async () => {
    const r = await demoRead("select public.list_customers($1,null,null,'spent',100,0) as r", [demo]);
    expect(r.total).toBe(40);
    expect(Object.values<number>(r.segments).reduce((a, b) => a + b, 0)).toBe(40);
    for (const c of r.rows.slice(0, 5)) {
      const raw = (await q(`select count(*) filter (where status='confirmed' and payment_status in ('paid','partially_refunded'))::int n,
        coalesce(sum(total_cents - refunded_cents) filter (where status='confirmed' and payment_status in ('paid','partially_refunded')),0)::int s
        from public.orders where customer_id=$1`, [c.id]))[0];
      expect([c.orders, c.spent_cents]).toEqual([raw.n, raw.s]);
      expect(c.segment).toBe(raw.s >= 50000 ? "vip" : raw.n >= 2 ? "returning" : raw.n === 1 ? "new" : "prospect");
    }
    const spent = r.rows.map((x: any) => x.spent_cents);
    expect([...spent].sort((a, b) => b - a)).toEqual(spent);
  });

  it("filters by segment, searches literally, sorts and paginates", async () => {
    const vip = await demoRead("select public.list_customers($1,null,'vip') as r", [demo]);
    expect(vip.rows.every((x: any) => x.segment === "vip")).toBe(true);
    expect((await demoRead("select public.list_customers($1,'%') as r", [demo])).total).toBe(0);
    const first = (await demoRead("select public.list_customers($1,null,null,'name',5,0) as r", [demo])).rows;
    const names = first.map((x: any) => x.full_name);
    expect([...names].sort()).toEqual(names);
    expect((await demoRead("select public.list_customers($1,null,null,'name',5,5) as r", [demo])).rows[0].id).not.toBe(first[0].id);
    const one = (await demoRead("select public.list_customers($1,$2) as r", [demo, names[0].split(" ")[0]])).rows;
    expect(one.length).toBeGreaterThan(0);
  });

  it("returns a customer profile with orders and notes; other tenants see nothing", async () => {
    const id = (await q("select customer_id from public.customer_notes limit 1"))[0].customer_id;
    const c = await demoRead("select public.get_customer($1,$2) as r", [demo, id]);
    expect(c.notes.length).toBeGreaterThan(0);
    expect(c.recent_orders.length).toBeGreaterThan(0);
    expect(await bob(async () => (await q<{ r: any }>("select public.get_customer($1,$2) as r", [org, id]))[0]!.r)).toBeNull();
  });

  it("lets staff add notes as themselves, and nobody else or edit/delete", async () => {
    const cust = await alice(async () => (await q("insert into public.customers (organization_id,email,full_name) values ($1,'k@example.com','Kay Test') returning id", [org]))[0].id);
    await carol(() => db.query("insert into public.customer_notes (organization_id,customer_id,body,created_by) values ($1,$2,'Called back',$3)", [org, cust, CAROL]));
    await expect(carol(() => db.query("insert into public.customer_notes (organization_id,customer_id,body,created_by) values ($1,$2,'x',$3)", [org, cust, ALICE]))).rejects.toThrow(/row-level security/i);
    await expect(bob(() => db.query("insert into public.customer_notes (organization_id,customer_id,body,created_by) values ($1,$2,'x',$3)", [org, cust, BOB]))).rejects.toThrow(/row-level security/i);
    await expect(asUser(db, ANON, () => db.query("insert into public.customer_notes (organization_id,customer_id,body,created_by) values ($1,$2,'x',$3)", [demo, cust, ANON]), { anonymous: true })).rejects.toThrow(/row-level security|foreign key/i);
    await expect(carol(() => db.query("delete from public.customer_notes"))).rejects.toThrow(/permission denied/i);
    expect((await aliceCall("select public.get_customer($1,$2) as r", [org, cust])).notes[0].body).toBe("Called back");
  });
});

describe("suppliers and purchase orders", () => {
  const items = (rows: object[]) => JSON.stringify(rows);
  const create = (sup: string, rows: object[], place = true, who = alice) =>
    who(async () => (await q("select public.create_purchase_order($1,$2,null,'note',$3::jsonb,$4) as r", [org, sup, items(rows), place]))[0].r);
  let po: string, itemA: string;

  it("manages suppliers by role, with unique names", async () => {
    await expect(alice(() => db.query("insert into public.suppliers (organization_id,name) values ($1,'ACME mills')", [org]))).rejects.toThrow(/duplicate key|unique/i);
    await expect(carol(() => db.query("insert into public.suppliers (organization_id,name) values ($1,'Nope Co')", [org]))).rejects.toThrow(/row-level security/i);
    expect((await q("select count(*)::int c from public.suppliers where organization_id=$1", [org]))[0].c).toBe(1);
  });

  it("creates numbered purchase orders and validates every line", async () => {
    po = await create(supplier, [{ variant_id: V1, quantity: 10, unit_cost_cents: 2000 }, { variant_id: V2, quantity: 5, unit_cost_cents: 3000 }]);
    expect((await q("select po_number, status from public.purchase_orders where id=$1", [po]))[0]).toEqual({ po_number: 1, status: "ordered" });
    const draft = await create(supplier, [{ variant_id: V1, quantity: 1, unit_cost_cents: 100 }], false);
    expect((await q("select po_number, status from public.purchase_orders where id=$1", [draft]))[0]).toEqual({ po_number: 2, status: "draft" });
    const demoVariant = (await q("select id from public.product_variants where organization_id=$1 limit 1", [demo]))[0].id;
    for (const bad of [
      [], [{ variant_id: V1, quantity: 0, unit_cost_cents: 1 }], [{ variant_id: V1, quantity: 1, unit_cost_cents: -1 }],
      [{ variant_id: V1, quantity: 1, unit_cost_cents: 1 }, { variant_id: V1, quantity: 2, unit_cost_cents: 1 }],
      [{ variant_id: demoVariant, quantity: 1, unit_cost_cents: 1 }],
    ]) await expect(create(supplier, bad)).rejects.toThrow(/line|at least one|between 1 and 100/i);
    await expect(create("00000000-0000-4000-8000-000000000999", [{ variant_id: V1, quantity: 1, unit_cost_cents: 1 }])).rejects.toThrow(/supplier not found/i);
    await expect(create(supplier, [{ variant_id: V1, quantity: 1, unit_cost_cents: 1 }], true, carol)).rejects.toThrow(/forbidden/i);
    await alice(() => db.query("select public.place_purchase_order($1,$2)", [org, draft]));
    await expect(alice(() => db.query("select public.place_purchase_order($1,$2)", [org, draft]))).rejects.toThrow(/only draft/i);
    await alice(() => db.query("select public.cancel_purchase_order($1,$2)", [org, draft]));
    itemA = (await q("select id from public.purchase_order_items where po_id=$1 and variant_id=$2", [po, V1]))[0].id;
  });

  it("blocks direct writes to purchase orders", async () => {
    await expect(alice(() => db.query("update public.purchase_orders set status='received'"))).rejects.toThrow(/permission denied/i);
    await expect(alice(() => db.query("update public.purchase_order_items set qty_received = 1"))).rejects.toThrow(/permission denied/i);
  });

  it("receives partially: stock, ledger, weighted-average cost and status all move together", async () => {
    expect(await onHand(V1, main)).toBe(10);
    await alice(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, main, items([{ item_id: itemA, quantity: 4 }])]));
    expect(await onHand(V1, main)).toBe(14);
    expect((await q("select status from public.purchase_orders where id=$1", [po]))[0].status).toBe("partially_received");
    expect((await q("select cost_cents from public.product_variants where id=$1", [V1]))[0].cost_cents).toBe(Math.round((10 * 1000 + 4 * 2000) / 14));
    expect((await q("select delta, reason, reference_type, note from public.inventory_movements where reference_id=$1", [po]))).toEqual([{ delta: 4, reason: "restock", reference_type: "purchase_order", note: "PO #1" }]);
  });

  it("rejects over-receipt, bad lines and duplicates, applying nothing", async () => {
    const itemB = (await q("select id from public.purchase_order_items where po_id=$1 and variant_id=$2", [po, V2]))[0].id;
    const stock = await onHand(V1, main);
    await expect(alice(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, main, items([{ item_id: itemA, quantity: 3 }, { item_id: itemB, quantity: 6 }])]))).rejects.toThrow(/only 5 outstanding/i);
    expect(await onHand(V1, main)).toBe(stock); // line A was valid but must not be applied
    await expect(alice(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, main, items([{ item_id: itemA, quantity: 1 }, { item_id: itemA, quantity: 1 }])]))).rejects.toThrow(/only once/i);
    await expect(alice(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, main, items([{ item_id: "00000000-0000-4000-8000-000000000999", quantity: 1 }])]))).rejects.toThrow(/does not belong/i);
    const demoWh = (await q("select id from public.warehouses where organization_id=$1 limit 1", [demo]))[0].id;
    await expect(alice(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, demoWh, items([{ item_id: itemA, quantity: 1 }])]))).rejects.toThrow(/warehouse not found/i);
    await expect(carol(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, main, items([{ item_id: itemA, quantity: 1 }])]))).rejects.toThrow(/forbidden/i);
    await expect(asUser(db, ANON, () => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, main, items([{ item_id: itemA, quantity: 1 }])]), { anonymous: true })).rejects.toThrow(/forbidden/i);
  });

  it("completes the order into a second warehouse and then refuses further changes", async () => {
    const lines = (await q("select id, qty_ordered - qty_received as n from public.purchase_order_items where po_id=$1", [po])).map((r) => ({ item_id: r.id, quantity: r.n }));
    await alice(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, east, items(lines)]));
    expect((await q("select status, received_at is not null as done from public.purchase_orders where id=$1", [po]))[0]).toEqual({ status: "received", done: true });
    expect(await onHand(V1, east)).toBe(6);
    expect(await onHand(V2, east)).toBe(5);
    await expect(alice(() => db.query("select public.receive_purchase_order($1,$2,$3,$4::jsonb)", [org, po, main, items([{ item_id: itemA, quantity: 1 }])]))).rejects.toThrow(/only ordered/i);
    await expect(alice(() => db.query("select public.cancel_purchase_order($1,$2)", [org, po]))).rejects.toThrow(/only draft or fully outstanding/i);
  });

  it("reads back lists and details, including for demo viewers", async () => {
    const list = await aliceCall("select public.list_purchase_orders($1) as r", [org]);
    expect(list.total).toBe(2);
    expect(list.rows.find((r: any) => r.po_number === 1)).toMatchObject({ status: "received", units_ordered: 15, units_received: 15, total_cost_cents: 35000, supplier_name: "Acme Mills" });
    expect((await aliceCall("select public.get_purchase_order($1,$2) as r", [org, po])).items).toHaveLength(2);
    const d = await demoRead("select public.list_purchase_orders($1) as r", [demo]);
    expect(d.rows.map((r: any) => r.status).sort()).toEqual(["draft", "ordered", "received"]);
    expect((await demoRead("select public.list_purchase_orders($1,'draft') as r", [demo])).total).toBe(1);
  });

  it("keeps on_hand equal to the ledger after all receipts", async () => {
    expect(await q(`select l.variant_id from public.inventory_levels l
      left join (select variant_id, warehouse_id, sum(delta) s from public.inventory_movements group by 1,2) m using (variant_id, warehouse_id)
      where l.on_hand <> coalesce(m.s,0)`)).toHaveLength(0);
  });
});

describe("notifications", () => {
  const unread = async (type = "low_stock") => (await q("select title, body from public.notifications where organization_id=$1 and type=$2 and read_at is null", [org, type]));

  it("raises one low-stock alert when available stock drops to the reorder point, not repeatedly", async () => {
    expect(await unread()).toHaveLength(0);
    await alice(() => db.query("select public.adjust_stock($1,$2,$3,-6,'damage')", [org, V1, main])); // 14 -> 8 on main, 14 total with east 6
    expect(await unread()).toHaveLength(0);
    await alice(() => db.query("select public.adjust_stock($1,$2,$3,-6,'damage')", [org, V1, main])); // main 2 + east 6 = 8 total
    expect(await unread()).toHaveLength(0);
    await alice(() => db.query("select public.adjust_stock($1,$2,$3,-3,'damage')", [org, V1, east])); // east 3 + main 2 = 5 total <= 5
    const n = await unread();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: "Low stock: Ops Tee", body: "OPS-1 has 5 available (reorder point 5)" });
    await alice(() => db.query("select public.adjust_stock($1,$2,$3,-1,'damage')", [org, V1, east]));
    expect(await unread()).toHaveLength(1); // deduplicated while unread
  });

  it("does not alert on restocks, and a transfer that momentarily dips a warehouse raises no false alarm", async () => {
    await alice(() => db.query("select public.adjust_stock($1,$2,$3,20,'restock')", [org, V2, main]));
    const before = (await q("select count(*)::int c from public.notifications where organization_id=$1", [org]))[0].c;
    await alice(() => db.query("select public.transfer_stock($1,$2,$3,$4,18)", [org, V2, main, east])); // main briefly 7 (>5) ... total unchanged at 25
    await alice(() => db.query("select public.transfer_stock($1,$2,$3,$4,6)", [org, V2, east, main]));
    expect((await q("select count(*)::int c from public.notifications where organization_id=$1", [org]))[0].c).toBe(before);
  });

  it("lets staff mark them read and then alerts again on the next drop", async () => {
    expect(await carol(async () => (await q("select public.mark_notifications_read($1) as r", [org]))[0].r)).toBe(1);
    expect(await unread()).toHaveLength(0);
    await alice(() => db.query("select public.adjust_stock($1,$2,$3,-1,'damage')", [org, V1, east]));
    expect(await unread()).toHaveLength(1);
    await expect(bob(() => db.query("select public.mark_notifications_read($1)", [org]))).rejects.toThrow(/forbidden/i);
    expect(await bob(async () => (await q("select * from public.notifications where organization_id=$1", [org])).length)).toBe(0);
  });

  it("announces a newly paid order", async () => {
    const id = (await q(`insert into public.orders (organization_id, order_number, status, payment_status, total_cents, subtotal_cents, currency, customer_name)
      values ($1, 7001, 'pending', 'unpaid', 12345, 12345, 'USD', 'Pat Payer') returning id`, [org]))[0].id;
    await db.query("update public.orders set payment_status='paid', status='confirmed' where id=$1", [id]);
    expect(await unread("new_order")).toEqual([{ title: "New order #7001", body: "123.45 USD paid by Pat Payer" }]);
    await db.query("update public.orders set payment_status='partially_refunded' where id=$1", [id]);
    expect(await unread("new_order")).toHaveLength(1);
  });

  it("is readable by demo viewers, who cannot change it", async () => {
    expect((await demoRead("select count(*)::int as r from public.notifications where organization_id=$1", [demo]))).toBeGreaterThan(0);
    await expect(asUser(db, ANON, () => db.query("select public.mark_notifications_read($1)", [demo]), { anonymous: true })).rejects.toThrow(/forbidden/i);
  });
});

describe("analytics", () => {
  const range = "now() - interval '100 days', now() + interval '1 day'";

  it("matches the raw orders for revenue, order count, AOV and category totals", async () => {
    const a = await demoRead(`select public.analytics_summary($1, ${range}) as r`, [demo]);
    const raw = (await q(`select coalesce(sum(total_cents - refunded_cents),0)::int rev, count(*)::int n from public.orders
      where organization_id=$1 and status='confirmed' and payment_status in ('paid','partially_refunded')`, [demo]))[0];
    expect([a.revenue_cents, a.orders]).toEqual([raw.rev, raw.n]);
    expect(a.aov_cents).toBe(Math.round(raw.rev / raw.n));
    const gross = (await q(`select coalesce(sum(i.quantity::bigint * i.unit_price_cents),0)::int g, coalesce(sum(i.quantity),0)::int u from public.order_items i
      join public.orders o on o.id=i.order_id where o.organization_id=$1 and o.status='confirmed' and o.payment_status in ('paid','partially_refunded')`, [demo]))[0];
    expect(a.by_category.reduce((s: number, c: any) => s + c.revenue_cents, 0)).toBe(gross.g);
    expect(a.units).toBe(gross.u);
    expect(a.daily.reduce((s: number, d: any) => s + d.revenue_cents, 0)).toBe(raw.rev);
    expect(a.best_sellers).toHaveLength(10);
    const units = a.best_sellers.map((b: any) => b.units);
    expect([...units].sort((x: number, y: number) => y - x)).toEqual(units);
  });

  it("splits weekly customers into new and returning consistently", async () => {
    const a = await demoRead(`select public.analytics_summary($1, ${range}) as r`, [demo]);
    const customersWithPaid = (await q(`select count(distinct customer_id)::int n from public.orders where organization_id=$1 and status='confirmed' and payment_status in ('paid','partially_refunded') and customer_id is not null`, [demo]))[0].n;
    expect(a.weekly_customers.reduce((s: number, w: any) => s + w.new_customers, 0)).toBe(customersWithPaid);
    expect(a.weekly_customers.some((w: any) => w.returning_customers > 0)).toBe(true);
  });

  it("estimates turnover from COGS and current stock value, and handles empty ranges and empty stores", async () => {
    const a = await demoRead(`select public.analytics_summary($1, ${range}) as r`, [demo]);
    expect(a.cogs_cents).toBeGreaterThan(0);
    expect(a.turnover).toBeCloseTo(a.cogs_cents / a.inventory_value_cents, 1);
    const none = await demoRead("select public.analytics_summary($1, now() + interval '10 days', now() + interval '20 days') as r", [demo]);
    expect([none.revenue_cents, none.orders, none.aov_cents, none.turnover, none.days_of_inventory, none.best_sellers.length]).toEqual([0, 0, 0, 0, null, 0]);
    const empty = await aliceCall("select public.analytics_summary($1, now() - interval '7 days', now() + interval '1 day') as r", [org]);
    expect(empty.orders).toBeLessThanOrEqual(1);
  });

  it("does not leak another tenant's analytics", async () => {
    const a = await bob(async () => (await q<{ r: any }>(`select public.analytics_summary($1, ${range}) as r`, [org]))[0]!.r);
    expect([a.revenue_cents, a.orders]).toEqual([0, 0]);
  });
});
