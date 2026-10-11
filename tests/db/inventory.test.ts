import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb } from "./harness";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const CAROL = "00000000-0000-4000-8000-00000000000c"; // staff in Alice's org
const ANON = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let org: string, demoOrg: string, main: string, east: string, variantA: string, productId: string;

const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const asAlice = <T>(fn: () => Promise<T>) => asUser(db, ALICE, fn);
const level = async (variant: string, wh: string) =>
  (await q<{ on_hand: number; reserved: number }>("select on_hand, reserved from public.inventory_levels where variant_id=$1 and warehouse_id=$2", [variant, wh]))[0];

beforeAll(async () => {
  db = await createDb();
  for (const u of [ALICE, BOB, CAROL, ANON]) await addUser(db, u);
  org = await asAlice(async () => (await q("select public.create_organization('Alice Goods','alice-goods') as id"))[0].id);
  await db.query("insert into public.organization_members values ($1,$2,'staff')", [org, CAROL]);
  demoOrg = (await q("select id from public.organizations where is_demo"))[0].id;
  main = (await q("select id from public.warehouses where organization_id=$1 and code='MAIN'", [org]))[0].id;
  east = await asAlice(async () =>
    (await q("insert into public.warehouses (organization_id,name,code) values ($1,'East','EAST') returning id", [org]))[0].id);
  productId = await asAlice(async () =>
    (await q("select public.save_product($1, null, $2::jsonb) as id", [org, JSON.stringify({
      name: "Test Jacket", slug: "test-jacket", status: "active",
      variants: [
        { sku: "TJ-S", option_size: "S", price_cents: 10000, cost_cents: 4000, low_stock_threshold: 5 },
        { sku: "TJ-M", option_size: "M", price_cents: 10000, sale_price_cents: 8000, cost_cents: 4000 },
      ] })]))[0].id);
  [variantA] = (await q("select id from public.product_variants where product_id=$1 order by sku", [productId])).map((r) => r.id);
}, 60_000);
afterAll(async () => db.close());

describe("create_organization / save_product", () => {
  it("gives a new workspace a default warehouse", () => expect(main).toBeTruthy());

  it("creates a product with variants and rejects a duplicate SKU in the same org", async () => {
    expect(await q("select count(*)::int c from public.product_variants where product_id=$1", [productId])).toEqual([{ c: 2 }]);
    await expect(asAlice(() => db.query("select public.save_product($1,null,$2::jsonb)", [org,
      JSON.stringify({ name: "Other", slug: "other", variants: [{ sku: "TJ-S", price_cents: 100 }] })]))).rejects.toThrow(/duplicate key|unique/i);
  });

  it("requires at least one variant", async () => {
    await expect(asAlice(() => db.query("select public.save_product($1,null,$2::jsonb)", [org,
      JSON.stringify({ name: "Empty", slug: "empty", variants: [] })]))).rejects.toThrow(/at least one variant/i);
  });

  it("rolls back the product when a later variant fails", async () => {
    await expect(asAlice(() => db.query("select public.save_product($1,null,$2::jsonb)", [org,
      JSON.stringify({ name: "Atomic", slug: "atomic", variants: [{ sku: "OK-1", price_cents: 100 }, { sku: "BAD", price_cents: -5 }] })]))).rejects.toThrow();
    expect(await q("select 1 from public.products where slug='atomic'")).toHaveLength(0);
  });

  it("cannot edit a product from another organization", async () => {
    await expect(asUser(db, BOB, () => db.query("select public.save_product($1,$2,$3::jsonb)", [org, productId,
      JSON.stringify({ name: "Hacked", slug: "hacked", variants: [{ sku: "X", price_cents: 1 }] })]))).rejects.toThrow(/row-level security|not found/i);
  });
});

describe("adjust_stock", () => {
  it("restocks and records a ledger entry", async () => {
    const r = await asAlice(() => db.query("select public.adjust_stock($1,$2,$3,50,'restock','PO-1') as n", [org, variantA, main]));
    expect((r.rows[0] as any).n).toBe(50);
    expect((await q("select delta, reason, created_by from public.inventory_movements where variant_id=$1", [variantA]))[0]).toMatchObject({ delta: 50, reason: "restock", created_by: ALICE });
  });

  it("refuses to take stock below zero, leaving everything unchanged", async () => {
    await expect(asAlice(() => db.query("select public.adjust_stock($1,$2,$3,-80,'adjustment')", [org, variantA, main]))).rejects.toThrow(/not enough/i);
    expect(await level(variantA, main)).toMatchObject({ on_hand: 50 });
    expect(await q("select 1 from public.inventory_movements where variant_id=$1", [variantA])).toHaveLength(1);
  });

  it("protects reserved stock", async () => {
    await db.exec(`update public.inventory_levels set reserved = 10 where variant_id='${variantA}' and warehouse_id='${main}'`);
    await expect(asAlice(() => db.query("select public.adjust_stock($1,$2,$3,-45,'adjustment')", [org, variantA, main]))).rejects.toThrow(/not enough unreserved/i);
    await asAlice(() => db.query("select public.adjust_stock($1,$2,$3,-40,'damage')", [org, variantA, main]));
    expect(await level(variantA, main)).toMatchObject({ on_hand: 10, reserved: 10 });
    await db.exec(`update public.inventory_levels set reserved = 0 where variant_id='${variantA}'`);
    await asAlice(() => db.query("select public.adjust_stock($1,$2,$3,40,'restock')", [org, variantA, main]));
  });

  it("rejects mismatched reason and direction", async () => {
    await expect(asAlice(() => db.query("select public.adjust_stock($1,$2,$3,-5,'restock')", [org, variantA, main]))).rejects.toThrow(/direction/i);
    await expect(asAlice(() => db.query("select public.adjust_stock($1,$2,$3,5,'sale')", [org, variantA, main]))).rejects.toThrow(/not allowed/i);
  });

  it("enforces roles and tenant boundaries", async () => {
    for (const [who, opts] of [[BOB, {}], [CAROL, {}], [ANON, { anonymous: true }]] as const) {
      await expect(asUser(db, who, () => db.query("select public.adjust_stock($1,$2,$3,1,'restock')", [org, variantA, main]), opts)).rejects.toThrow(/forbidden/i);
    }
    const demoVariant = (await q("select id from public.product_variants where organization_id=$1 limit 1", [demoOrg]))[0].id;
    await expect(asAlice(() => db.query("select public.adjust_stock($1,$2,$3,1,'restock')", [org, demoVariant, main]))).rejects.toThrow(/not found/i);
  });
});

describe("transfer_stock", () => {
  it("moves stock between warehouses atomically", async () => {
    await asAlice(() => db.query("select public.transfer_stock($1,$2,$3,$4,30)", [org, variantA, main, east]));
    expect(await level(variantA, main)).toMatchObject({ on_hand: 20 });
    expect(await level(variantA, east)).toMatchObject({ on_hand: 30 });
    const mv = await q("select delta, reference_id from public.inventory_movements where reason in ('transfer_in','transfer_out')");
    expect(mv).toHaveLength(2);
    expect(mv[0].reference_id).toBe(mv[1].reference_id);
    expect(mv[0].delta + mv[1].delta).toBe(0);
  });

  it("rejects over-transfers and same-warehouse transfers without side effects", async () => {
    await expect(asAlice(() => db.query("select public.transfer_stock($1,$2,$3,$4,999)", [org, variantA, main, east]))).rejects.toThrow(/only 20 units/i);
    await expect(asAlice(() => db.query("select public.transfer_stock($1,$2,$3,$3,1)", [org, variantA, main]))).rejects.toThrow(/different warehouses/i);
    expect(await level(variantA, main)).toMatchObject({ on_hand: 20 });
    expect(await level(variantA, east)).toMatchObject({ on_hand: 30 });
  });

  it("keeps on_hand equal to the ledger", async () => {
    const bad = await q(`select l.variant_id from public.inventory_levels l
      left join (select variant_id, warehouse_id, sum(delta) s from public.inventory_movements group by 1,2) m
        on m.variant_id=l.variant_id and m.warehouse_id=l.warehouse_id where l.on_hand <> coalesce(m.s,0)`);
    expect(bad).toHaveLength(0);
  });
});

describe("deleting products", () => {
  it("is blocked once a product has stock history", async () => {
    await expect(asAlice(() => db.query("delete from public.products where id=$1", [productId]))).rejects.toThrow(/foreign key/i);
  });
  it("works for a product that never had stock", async () => {
    const id = await asAlice(async () => (await q("select public.save_product($1,null,$2::jsonb) as id", [org,
      JSON.stringify({ name: "Draft", slug: "draft", variants: [{ sku: "D-1", price_cents: 100 }] })]))[0].id);
    await asAlice(() => db.query("delete from public.products where id=$1", [id]));
    expect(await q("select 1 from public.products where id=$1", [id])).toHaveLength(0);
  });
});

describe("listing functions (demo org, anonymous session)", () => {
  const call = async (sql: string, params: unknown[]) =>
    asUser(db, ANON, async () => (await q<{ r: any }>(sql, params))[0]!.r, { anonymous: true });

  it("searches by name and SKU, filters by status, and paginates with a total", async () => {
    const jacket = await call("select public.list_products($1,'jacket') as r", [demoOrg]);
    expect(jacket.total).toBe(1);
    expect(jacket.rows[0].name).toBe("Waxed Field Jacket");
    expect((await call("select public.list_products($1,null,'draft') as r", [demoOrg])).total).toBe(1);
    const page = await call("select public.list_products($1,null,null,null,'name','asc',5,0) as r", [demoOrg]);
    expect([page.total, page.rows.length, page.rows[0].name]).toEqual([11, 5, "Alder Daypack"]);
    const next = await call("select public.list_products($1,null,null,null,'name','asc',5,5) as r", [demoOrg]);
    expect(next.rows[0].name).not.toBe(page.rows[0].name);
    expect((await call("select public.list_products($1,'AF-01') as r", [demoOrg])).total).toBe(1);
  });

  it("treats LIKE wildcards in search as literal text", async () => {
    expect((await call("select public.list_products($1,'%') as r", [demoOrg])).total).toBe(0);
  });

  it("falls back to a safe sort for unknown sort keys", async () => {
    const r = await call("select public.list_products($1,null,null,null,'name; drop table products','asc') as r", [demoOrg]);
    expect(r.total).toBe(11);
  });

  it("lists low-stock inventory with a valuation summary", async () => {
    const r = await call("select public.list_inventory($1,null,true) as r", [demoOrg]);
    expect(r.total).toBeGreaterThan(0);
    expect(r.rows.every((x: any) => x.available <= x.threshold)).toBe(true);
    expect(r.summary.valuation_cents).toBeGreaterThan(0);
  });

  it("returns movement history newest first", async () => {
    const r = await call("select public.list_movements($1,10,0) as r", [demoOrg]);
    expect(r.rows).toHaveLength(10);
    const times = r.rows.map((x: any) => Date.parse(x.created_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("does not leak another tenant's rows", async () => {
    const r = await asUser(db, BOB, async () => (await q<{ r: any }>("select public.list_products($1) as r", [org]))[0]!.r);
    expect(r.total).toBe(0);
  });
});
