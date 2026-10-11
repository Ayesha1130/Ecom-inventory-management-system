import { timingSafeEqual } from "node:crypto";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Releases stock held by unpaid orders past their expiry. Prefer pg_cron (see README); this is a fallback. */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminConfigured()) return Response.json({ error: "Not configured" }, { status: 503 });
  const { data, error } = await createAdminClient().rpc("release_expired_reservations");
  if (error) return Response.json({ error: "Failed" }, { status: 500 });
  return Response.json({ released: data });
}
