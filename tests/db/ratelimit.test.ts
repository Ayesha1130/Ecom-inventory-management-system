import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asService, asUser, createDb } from "./harness";

let db: PGlite;
const q = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const hit = (bucket: string, limit = 3, window = 60) =>
  asService(db, async () => (await q<{ r: any }>("select public.rate_limit_check($1,$2,$3) as r", [bucket, limit, window]))[0]!.r);

beforeAll(async () => { db = await createDb(); }, 60_000);
afterAll(async () => db.close());

describe("rate_limit_check", () => {
  it("allows up to the limit, then blocks with a retry hint inside the window", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit("login:a"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0]);
    expect(results[3].retry_after).toBeGreaterThan(0);
    expect(results[3].retry_after).toBeLessThanOrEqual(60);
  });

  it("keeps buckets independent, so one visitor can't exhaust another's allowance", async () => {
    for (let i = 0; i < 4; i++) await hit("login:mallory");
    expect((await hit("login:mallory")).allowed).toBe(false);
    expect((await hit("login:alice")).allowed).toBe(true);
    expect((await hit("cart:mallory")).allowed).toBe(true);
  });

  it("starts a fresh count in a new window", async () => {
    await db.query("insert into public.rate_limit_hits values ('old:x', now() - interval '2 hours', 999)");
    expect(await hit("old:x")).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("rejects nonsense parameters", async () => {
    for (const args of [["", 3, 60], ["b", 0, 60], ["b", 3, 0], ["b", 3, 999999], ["x".repeat(201), 3, 60]] as const) {
      await expect(asService(db, () => db.query("select public.rate_limit_check($1,$2,$3)", [...args]))).rejects.toThrow(/invalid rate limit/i);
    }
  });

  it("can be called only by the server, never by browsers", async () => {
    await expect(asAnon(db, () => db.query("select public.rate_limit_check('a',1,1)"))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, "00000000-0000-4000-8000-00000000000a", () => db.query("select public.rate_limit_check('a',1,1)"))).rejects.toThrow(/permission denied/i);
    await expect(asAnon(db, () => db.query("select * from public.rate_limit_hits"))).rejects.toThrow(/permission denied/i);
  });

  it("purges only stale windows", async () => {
    const before = (await q("select count(*)::int c from public.rate_limit_hits"))[0].c;
    await db.query("insert into public.rate_limit_hits values ('stale:y', now() - interval '3 days', 5)");
    expect(await asService(db, async () => (await q<{ r: number }>("select public.purge_rate_limits() as r"))[0]!.r)).toBe(1); // only stale:y is older than a day
    expect((await q("select count(*)::int c from public.rate_limit_hits"))[0].c).toBe(before);
    expect((await q("select 1 from public.rate_limit_hits where bucket='old:x'")).length).toBeGreaterThan(0); // 2 hours old: kept
  });
});
