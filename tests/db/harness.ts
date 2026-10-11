import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../supabase");

// Minimal stand-in for the Supabase pieces the migrations rely on.
const authShim = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(authShim);
  for (const f of readdirSync(join(root, "migrations")).sort()) {
    await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  }
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  return db;
}

export async function addUser(db: PGlite, id: string, email?: string) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email ?? null]);
}

/** Run a callback as an authenticated end user (RLS applies), then restore the superuser. */
export async function asUser<T>(
  db: PGlite,
  sub: string,
  fn: () => Promise<T>,
  opts: { anonymous?: boolean; email?: string } = {},
): Promise<T> {
  const claims = JSON.stringify({ sub, role: "authenticated", is_anonymous: !!opts.anonymous, email: opts.email });
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

/** Run a callback as a logged-out visitor (the `anon` role, no JWT). */
export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claims', '', false)");
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

/** Run a callback as the server's service_role (what the Next.js server uses for webhooks and order creation). */
export async function asService<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claims', '', false)");
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
