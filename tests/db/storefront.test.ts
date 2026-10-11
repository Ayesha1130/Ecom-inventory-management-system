import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asAnon, asUser, createDb } from "./harness";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const CAROL = "00000000-0000-4000-8000-00000000000c";
const T1 = "t1_" + "a".repeat(40);
const T2 = "t2_" + "b".repeat(40);

let db: PGlite;
let demoVariant: string; // a well-stocked variant in the demo store

const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const anon = <T = any>(sql: string, params: unknown[] = []) => asAnon(db, async () => (await q<{ r: T }>(sql, params))[0]!.r);

beforeAll(async () => {
  db = await createDb();
  for (const u of [ALICE, CAROL]) await addUser(db, u);
  await asUser(db, ALICE, async () => (await q("select public.create_organization('Alice Goods','alice-goods') as id"))[0].id);
  demoVariant = (await q(`select v.id from public.product_variants v join public.products p on p.id = v.product_id
    where p.slug = 'ridge-canvas-tote' order by v.sku limit 1`))[0].id;
}, 60_000);
afterAll(async () => db.close());

describe("public read API", () => {
  it("describes a published store with only active, non-empty categories", async () => {
    const info = await anon("select public.storefront_info('alder-finch') as r");
    expect(info).toMatchObject({ name: "Alder & Finch", currency: "USD", is_demo: true });
    expect(info.categories.map((c: any) => c.slug)).toEqual(["accessories", "bags", "outerwear"]);
    expect(info.categories.find((c: any) => c.slug === "accessories").count).toBe(3); // 4 accessories exist, but the draft scarf is excluded
  });

  it("hides unpublished and unknown stores, and the publish switch works for admins only", async () => {
    expect(await anon("select public.storefront_info('alice-goods') as r")).toBeNull();
    expect(await anon("select public.storefront_info('nope-nope') as r")).toBeNull();
    await expect(asUser(db, CAROL, () => db.query("update public.stores set is_published = true where slug = 'alice-goods'"))).resolves.toMatchObject({ affectedRows: 0 });
    await asUser(db, ALICE, () => db.query("update public.stores set is_published = true, tagline = 'Hi' where slug = 'alice-goods'"));
    expect((await anon("select public.storefront_info('alice-goods') as r")).tagline).toBe("Hi");
    await asUser(db, ALICE, () => db.query("update public.stores set is_published = false where slug = 'alice-goods'"));
  });

  it("does not let an admin change the store slug", async () => {
    await expect(asUser(db, ALICE, () => db.query("update public.stores set slug = 'hijack' where slug = 'alice-goods'"))).rejects.toThrow(/permission denied/i);
  });

  it("lists only active products, with search, category, sort and pagination", async () => {
    const all = await anon("select public.storefront_products('alder-finch', null, null, 'name', 4, 0) as r");
    expect([all.total, all.rows.length, all.rows[0].name]).toEqual([10, 4, "Alder Daypack"]);
    expect((await anon("select public.storefront_products('alder-finch', 'bags') as r")).total).toBe(3);
    expect((await anon("select public.storefront_products('alder-finch', null, 'tote') as r")).total).toBe(1);
    expect((await anon("select public.storefront_products('alder-finch', null, '%') as r")).total).toBe(0);
    const cheap = await anon("select public.storefront_products('alder-finch', null, null, 'price_asc', 1) as r");
    expect(cheap.rows[0].name).toBe("Field Trail Sock");
    const exp = await anon("select public.storefront_products('alder-finch', null, null, 'price_desc', 1) as r");
    expect(exp.rows[0].name).toBe("Waxed Field Jacket");
    expect(all.rows[0].colors.length).toBeGreaterThan(0);
  });

  it("never exposes cost, thresholds, SKUs or exact deep stock", async () => {
    const p = await anon("select public.storefront_product('alder-finch', 'linen-overshirt') as r");
    expect(p.variants).toHaveLength(8);
    for (const v of p.variants) {
      expect(Object.keys(v).sort()).toEqual(["available", "color", "id", "price_cents", "sale_price_cents", "size"]);
      expect(v.available).toBeLessThanOrEqual(20);
    }
    expect(p.variants[0].sale_price_cents).toBe(9600);
  });

  it("returns null for drafts, unknown products and the wrong store", async () => {
    expect(await anon("select public.storefront_product('alder-finch', 'harbor-wool-scarf') as r")).toBeNull();
    expect(await anon("select public.storefront_product('alder-finch', 'nope') as r")).toBeNull();
    expect(await anon("select public.storefront_product('alice-goods', 'linen-overshirt') as r")).toBeNull();
  });

  it("gives visitors no direct table access at all", async () => {
    for (const t of ["products", "product_variants", "inventory_levels", "carts", "cart_items", "orders", "stores"]) {
      await expect(asAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/i);
    }
  });
});

describe("guest cart", () => {
  const add = (token: string, variant: string, qty: number, store = "alder-finch") =>
    anon("select public.cart_add($1,$2,$3,$4) as r", [store, token, variant, qty]);

  it("starts empty for an unknown token", async () => {
    expect(await anon("select public.cart_get('alder-finch', $1) as r", [T1])).toEqual({ lines: [], subtotal_cents: 0, count: 0 });
  });

  it("adds, accumulates and prices lines live", async () => {
    let cart = await add(T1, demoVariant, 2);
    expect(cart.count).toBe(2);
    cart = await add(T1, demoVariant, 1);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]).toMatchObject({ product_name: "Ridge Canvas Tote", quantity: 3, unit_price_cents: 6400 });
    expect(cart.subtotal_cents).toBe(19200);
    await db.query("update public.product_variants set price_cents = 7000 where id = $1", [demoVariant]);
    expect((await anon("select public.cart_get('alder-finch', $1) as r", [T1])).subtotal_cents).toBe(21000);
  });

  it("stores only a hash of the token", async () => {
    const rows = await q("select token_hash from public.carts");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(T1);
  });

  it("isolates carts by token", async () => {
    expect((await anon("select public.cart_get('alder-finch', $1) as r", [T2])).count).toBe(0);
    await expect(anon("select public.cart_set_qty('alder-finch', $1, $2, 1) as r", [T2, demoVariant])).rejects.toThrow(/cart not found/i);
  });

  it("refuses to exceed available stock and explains why", async () => {
    await db.exec(`update public.inventory_levels set on_hand = 3, reserved = 0 where variant_id = '${demoVariant}'`);
    await db.exec(`update public.inventory_levels set on_hand = 0 where variant_id = '${demoVariant}' and warehouse_id <> (select warehouse_id from public.inventory_levels where variant_id = '${demoVariant}' order by warehouse_id limit 1)`);
    const avail = (await q("select coalesce(sum(on_hand - reserved),0)::int a from public.inventory_levels where variant_id = $1", [demoVariant]))[0].a;
    expect(avail).toBe(3);
    await expect(add(T1, demoVariant, 1)).rejects.toThrow(/only 3 available/i);
    await expect(anon("select public.cart_set_qty('alder-finch', $1, $2, 4) as r", [T1, demoVariant])).rejects.toThrow(/only 3 available/i);
    expect((await anon("select public.cart_set_qty('alder-finch', $1, $2, 2) as r", [T1, demoVariant])).count).toBe(2);
  });

  it("reports out-of-stock items", async () => {
    await db.exec(`update public.inventory_levels set on_hand = 0 where variant_id = '${demoVariant}'`);
    await expect(add(T2, demoVariant, 1)).rejects.toThrow(/out of stock/i);
  });

  it("rejects bad quantities and invalid tokens", async () => {
    await expect(add(T2, demoVariant, 0)).rejects.toThrow(/quantity/i);
    await expect(add(T2, demoVariant, 100)).rejects.toThrow(/quantity/i);
    await expect(add("short", demoVariant, 1)).rejects.toThrow(/invalid cart/i);
  });

  it("will not add items from another tenant or from drafts", async () => {
    const draftVariant = (await q("select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.slug = 'harbor-wool-scarf'"))[0].id;
    await expect(add(T2, draftVariant, 1)).rejects.toThrow(/not available/i);
    await asUser(db, ALICE, () => db.query("update public.stores set is_published = true where slug = 'alice-goods'"));
    await expect(add(T2, demoVariant, 1, "alice-goods")).rejects.toThrow(/not available/i);
  });

  it("removes a line with quantity 0 and drops archived products", async () => {
    expect((await anon("select public.cart_set_qty('alder-finch', $1, $2, 0) as r", [T1, demoVariant])).count).toBe(0);
    await db.exec(`update public.inventory_levels set on_hand = 50 where variant_id = '${demoVariant}'`);
    await add(T1, demoVariant, 1);
    await db.exec("update public.products set status = 'archived' where slug = 'ridge-canvas-tote'");
    expect((await anon("select public.cart_get('alder-finch', $1) as r", [T1])).lines).toHaveLength(0);
  });

  it("creates an unpublished store for every new organization", async () => {
    const id = await asUser(db, ALICE, async () => (await q("select public.create_organization('Second Shop','second-shop') as id"))[0].id);
    const s = await q("select slug, is_published from public.stores where organization_id = $1", [id]);
    expect(s).toEqual([{ slug: "second-shop", is_published: false }]);
  });
});
