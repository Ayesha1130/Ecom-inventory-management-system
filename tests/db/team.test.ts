import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addUser, asUser, createDb } from "./harness";

const U = (n: string) => `00000000-0000-4000-8000-0000000000${n}`;
const ALICE = U("a1"), CAROL = U("c1"), DAVE = U("d1"), ERIN = U("e1"), FRANK = U("f1"), BOB = U("b1"), ANON = U("aa");
const emails: Record<string, string> = { [ALICE]: "alice@example.com", [CAROL]: "carol@example.com", [DAVE]: "dave@example.com", [ERIN]: "erin@example.com", [FRANK]: "frank@example.com", [BOB]: "bob@example.com" };
const tok = (s: string) => s.padEnd(43, "x");

let db: PGlite;
let org: string;

const q = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const as = (who: string) => <T>(fn: () => Promise<T>) => asUser(db, who, fn, { email: emails[who] });
const call = (who: string, sql: string, p: unknown[] = []) => as(who)(async () => (await q<{ r: any }>(sql, p))[0]!.r);
const invite = (who: string, email: string, role: string, token: string) => call(who, "select public.create_invitation($1,$2,$3,$4) as r", [org, email, role, token]);
const accept = (who: string, token: string, opts: { anonymous?: boolean } = {}) =>
  asUser(db, who, async () => (await q<{ r: any }>("select public.accept_invitation($1) as r", [token]))[0]!.r, { email: emails[who], ...opts });
const roleOf = async (u: string) => (await q("select role from public.organization_members where organization_id=$1 and user_id=$2", [org, u]))[0]?.role ?? null;

beforeAll(async () => {
  db = await createDb();
  for (const [id, email] of Object.entries(emails)) await addUser(db, id, email);
  await addUser(db, ANON);
  org = await as(ALICE)(async () => (await q("select public.create_organization('Team Co','team-co') as id"))[0].id);
  await db.query("insert into public.organization_members values ($1,$2,'staff'), ($1,$3,'admin')", [org, CAROL, DAVE]);
}, 60_000);
afterAll(async () => db.close());

describe("invitations", () => {
  it("lets only admins and above invite, never to owner or above their own role", async () => {
    await expect(invite(CAROL, "x@example.com", "staff", tok("t0"))).rejects.toThrow(/forbidden/i);
    await expect(invite(ALICE, "x@example.com", "owner", tok("t0"))).rejects.toThrow(/owners can't be invited/i);
    await expect(invite(DAVE, "x@example.com", "owner", tok("t0"))).rejects.toThrow(/owners can't be invited/i);
    await expect(invite(BOB, "x@example.com", "staff", tok("t0"))).rejects.toThrow(/forbidden/i);
    await expect(invite(ALICE, "not-an-email", "staff", tok("t0"))).rejects.toThrow(/valid email/i);
    await expect(invite(ALICE, "x@example.com", "staff", "short")).rejects.toThrow(/invalid request/i);
    await expect(invite(ALICE, "Carol@Example.com", "staff", tok("t0"))).rejects.toThrow(/already on your team/i);
  });

  it("stores only a hash and replaces an earlier invitation to the same address", async () => {
    await invite(ALICE, "Erin@Example.com", "manager", tok("old"));
    await invite(DAVE, "erin@example.com", "manager", tok("new"));
    const rows = await q("select email, token_hash from public.invitations where organization_id=$1", [org]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("erin@example.com");
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("new");
    await expect(accept(ERIN, tok("old"))).rejects.toThrow(/invalid or has expired/i);
  });

  it("cannot be created, edited or deleted directly; only admins can read them", async () => {
    await expect(as(ALICE)(() => db.query("insert into public.invitations (organization_id,email,role,token_hash,invited_by) values ($1,'z@example.com','admin','h',$2)", [org, ALICE]))).rejects.toThrow(/permission denied/i);
    await expect(as(ALICE)(() => db.query("delete from public.invitations"))).rejects.toThrow(/permission denied/i);
    expect((await as(ALICE)(async () => (await q("select * from public.invitations")).length))).toBe(1);
    expect((await as(CAROL)(async () => (await q("select * from public.invitations")).length))).toBe(0);
  });

  it("previews valid links only", async () => {
    expect(await call(ERIN, "select public.invitation_preview($1) as r", [tok("new")])).toEqual({ organization: "Team Co", role: "manager", email: "erin@example.com" });
    expect(await call(ERIN, "select public.invitation_preview($1) as r", [tok("nope")])).toBeNull();
  });

  it("is accepted only by the invited email, once, while valid, and never by demo sessions", async () => {
    await expect(accept(FRANK, tok("new"))).rejects.toThrow(/different email/i);
    await expect(accept(ERIN, tok("nope"))).rejects.toThrow(/invalid or has expired/i);
    await expect(accept(ANON, tok("new"), { anonymous: true })).rejects.toThrow(/create an account/i);
    expect(await roleOf(ERIN)).toBeNull();
    expect(await accept(ERIN, tok("new"))).toEqual({ slug: "team-co", name: "Team Co" });
    expect(await roleOf(ERIN)).toBe("manager");
    await expect(accept(ERIN, tok("new"))).rejects.toThrow(/invalid or has expired/i);

    await invite(ALICE, "frank@example.com", "staff", tok("fr"));
    await db.query("update public.invitations set expires_at = now() - interval '1 minute' where email='frank@example.com'");
    await expect(accept(FRANK, tok("fr"))).rejects.toThrow(/invalid or has expired/i);
    expect(await roleOf(FRANK)).toBeNull();
  });

  it("gives the new member access to the workspace immediately", async () => {
    expect(await as(ERIN)(async () => (await q("select id from public.organizations where slug='team-co'")).length)).toBe(1);
    await as(ERIN)(() => db.query("insert into public.categories (organization_id,name,slug) values ($1,'Tees','tees')", [org])); // manager can write
  });

  it("revokes pending invitations (admins only)", async () => {
    const id = await invite(ALICE, "gone@example.com", "staff", tok("gone"));
    await expect(as(CAROL)(() => db.query("select public.revoke_invitation($1,$2)", [org, id]))).rejects.toThrow(/forbidden/i);
    await as(DAVE)(() => db.query("select public.revoke_invitation($1,$2)", [org, id]));
    await expect(accept(FRANK, tok("gone"))).rejects.toThrow();
    await expect(as(DAVE)(() => db.query("select public.revoke_invitation($1,$2)", [org, id]))).rejects.toThrow(/not found/i);
  });
});

describe("roles", () => {
  const change = (who: string, target: string, role: string) => call(who, "select public.change_member_role($1,$2,$3)::text as r", [org, target, role]);
  const remove = (who: string, target: string) => call(who, "select public.remove_member($1,$2)::text as r", [org, target]);

  it("only lets admins and above change roles, never their own, never above their own", async () => {
    await expect(change(CAROL, ERIN, "staff")).rejects.toThrow(/forbidden/i);
    await expect(change(ERIN, CAROL, "admin")).rejects.toThrow(/forbidden/i); // manager
    await expect(change(BOB, CAROL, "admin")).rejects.toThrow(/forbidden/i);
    await expect(change(DAVE, DAVE, "owner")).rejects.toThrow(/own role/i);
    await expect(change(DAVE, CAROL, "owner")).rejects.toThrow(/above your own/i);
    await expect(change(DAVE, ALICE, "staff")).rejects.toThrow(/above your own/i); // can't touch the owner
    await change(DAVE, CAROL, "manager");
    expect(await roleOf(CAROL)).toBe("manager");
  });

  it("applies the new permissions immediately", async () => {
    await as(CAROL)(() => db.query("select public.adjust_stock($1,$2,$3,1,'restock')", [org, "00000000-0000-4000-8000-000000000999", "00000000-0000-4000-8000-000000000998"]).catch((e) => { if (!/not found/i.test(String(e))) throw e; }));
    await change(ALICE, CAROL, "staff");
    await expect(as(CAROL)(() => db.query("select public.adjust_stock($1,$2,$3,1,'restock')", [org, "00000000-0000-4000-8000-000000000999", "00000000-0000-4000-8000-000000000998"]))).rejects.toThrow(/forbidden/i);
  });

  it("never lets an organization lose its last owner", async () => {
    await expect(remove(ALICE, ALICE)).rejects.toThrow(/at least one owner/i);
    await change(ALICE, DAVE, "owner");
    await change(DAVE, ALICE, "admin"); // two owners, so demoting one is fine
    expect(await roleOf(ALICE)).toBe("admin");
    await expect(change(ALICE, DAVE, "admin")).rejects.toThrow(/above your own/i);
    await change(DAVE, ALICE, "owner");
    await remove(DAVE, DAVE); // an owner may leave when another remains
    expect(await roleOf(DAVE)).toBeNull();
    await expect(remove(ALICE, ALICE)).rejects.toThrow(/at least one owner/i);
  });

  it("limits who can remove whom, and cuts off access straight away", async () => {
    await expect(remove(CAROL, ERIN)).rejects.toThrow(/can't remove/i);
    await expect(remove(BOB, ERIN)).rejects.toThrow(/forbidden/i);
    await db.query("insert into public.organization_members values ($1,$2,'admin')", [org, DAVE]);
    await expect(remove(DAVE, ALICE)).rejects.toThrow(/can't remove/i); // can't remove an owner
    await remove(DAVE, ERIN);
    expect(await as(ERIN)(async () => (await q("select id from public.organizations where slug='team-co'")).length)).toBe(0);
    await remove(CAROL, CAROL); // staff can leave
    expect(await roleOf(CAROL)).toBeNull();
  });

  it("lists members with names and emails to members only", async () => {
    const list = await call(ALICE, "select public.list_members($1) as r", [org]);
    expect(list.map((m: any) => m.email).sort()).toEqual(["alice@example.com", "dave@example.com"]);
    expect(list.find((m: any) => m.email === "alice@example.com")).toMatchObject({ role: "owner", is_you: true });
    expect(await call(BOB, "select public.list_members($1) as r", [org])).toEqual([]);
  });
});

describe("audit log", () => {
  it("records team changes with the acting user, readable by admins only", async () => {
    const log = await call(ALICE, "select public.list_audit_logs($1,100,0) as r", [org]);
    const actions = log.rows.map((r: any) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["organization.created", "invitation.created", "member.joined", "member.role_changed", "member.removed", "member.left", "invitation.revoked"]));
    const changed = log.rows.find((r: any) => r.action === "member.role_changed");
    expect(changed.actor).toBe("dave@example.com");
    expect(changed.metadata).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    const times = log.rows.map((r: any) => Date.parse(r.created_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect((await call(BOB, "select public.list_audit_logs($1) as r", [org])).total).toBe(0);
    await db.query("insert into public.organization_members values ($1,$2,'manager') on conflict do nothing", [org, FRANK]);
    expect((await call(FRANK, "select public.list_audit_logs($1) as r", [org])).total).toBe(0); // managers can't read it
  });

  it("cannot be altered by anyone", async () => {
    await expect(as(ALICE)(() => db.query("delete from public.audit_logs"))).rejects.toThrow(/permission denied/i);
    await expect(as(ALICE)(() => db.query("update public.audit_logs set action='x'"))).rejects.toThrow(/permission denied/i);
  });
});
