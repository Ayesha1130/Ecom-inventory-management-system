import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb } from "./harness";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const ANON = "00000000-0000-4000-8000-0000000000aa";

let db: PGlite;
let aliceOrg: string;
let demoOrg: string;

beforeAll(async () => {
  db = await createDb();
  for (const u of [ALICE, BOB, ANON]) await addUser(db, u);
  aliceOrg = await asUser(db, ALICE, async () => {
    const r = await db.query<{ id: string }>("select public.create_organization('Alice Goods', 'alice-goods') as id");
    return r.rows[0]!.id;
  });
  demoOrg = (await db.query<{ id: string }>("select id from public.organizations where is_demo")).rows[0]!.id;
}, 60_000);

afterAll(async () => db.close());

describe("tenant isolation", () => {
  it("lets the owner see their own organization", async () => {
    const rows = await asUser(db, ALICE, async () => (await db.query("select id from public.organizations where slug = 'alice-goods'")).rows);
    expect(rows).toHaveLength(1);
  });

  it("hides another tenant's organization and rows", async () => {
    await asUser(db, ALICE, () =>
      db.query("insert into public.categories (organization_id, name, slug) values ($1, 'Shoes', 'shoes')", [aliceOrg]),
    );
    const { orgs, cats, members } = await asUser(db, BOB, async () => ({
      orgs: (await db.query("select id from public.organizations where id = $1", [aliceOrg])).rows,
      cats: (await db.query("select id from public.categories where organization_id = $1", [aliceOrg])).rows,
      members: (await db.query("select * from public.organization_members where organization_id = $1", [aliceOrg])).rows,
    }));
    expect([orgs.length, cats.length, members.length]).toEqual([0, 0, 0]);
  });

  it("blocks writing into another tenant's organization", async () => {
    await expect(
      asUser(db, BOB, () =>
        db.query("insert into public.categories (organization_id, name, slug) values ($1, 'Evil', 'evil')", [aliceOrg]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("blocks cross-tenant references at the schema level", async () => {
    await expect(
      db.query(
        `insert into public.products (organization_id, category_id, name, slug)
         select $1, c.id, 'x', 'x' from public.categories c where c.organization_id = $2 limit 1`,
        [aliceOrg, demoOrg],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("does not let an admin turn their org into a public demo", async () => {
    await expect(
      asUser(db, ALICE, () => db.query("update public.organizations set is_demo = true where id = $1", [aliceOrg])),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps the audit log append-only", async () => {
    await expect(
      asUser(db, ALICE, () => db.query("delete from public.audit_logs where organization_id = $1", [aliceOrg])),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("demo sessions", () => {
  it("can read demo data and the dashboard aggregate", async () => {
    const summary = await asUser(
      db, ANON,
      async () => (await db.query<{ s: any }>(
        "select public.dashboard_summary($1, now() - interval '30 days', now() + interval '1 day') as s", [demoOrg],
      )).rows[0]!.s,
      { anonymous: true },
    );
    expect(summary.orders).toBeGreaterThan(50);
    expect(summary.revenue_cents).toBeGreaterThan(0);
    expect(summary.daily.length).toBeGreaterThanOrEqual(30);
    expect(summary.low_stock_count).toBeGreaterThan(0);
  });

  it("cannot write to the demo org", async () => {
    await expect(
      asUser(db, ANON, () =>
        db.query("insert into public.categories (organization_id, name, slug) values ($1, 'x', 'x')", [demoOrg]),
        { anonymous: true }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot create an organization", async () => {
    await expect(
      asUser(db, ANON, () => db.query("select public.create_organization('Nope Co', 'nope-co')"), { anonymous: true }),
    ).rejects.toThrow(/cannot create/i);
  });
});

describe("seed integrity", () => {
  it("keeps on_hand equal to the sum of its ledger movements", async () => {
    const r = await db.query(
      `select l.variant_id from public.inventory_levels l
       left join (select variant_id, warehouse_id, sum(delta) s from public.inventory_movements group by 1, 2) m
         on m.variant_id = l.variant_id and m.warehouse_id = l.warehouse_id
       where l.on_hand <> coalesce(m.s, 0)`,
    );
    expect(r.rows).toHaveLength(0);
  });
});
