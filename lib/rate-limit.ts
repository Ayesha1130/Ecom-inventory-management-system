import { headers } from "next/headers";
import { z } from "zod";
import { clientKey } from "@/lib/client-key";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";

const resultSchema = z.object({ allowed: z.boolean(), remaining: z.number(), retry_after: z.number() });

export type Limit = { ok: true } | { ok: false; message: string };

/**
 * Counts one hit against `name` for the caller and says whether it's allowed. It FAILS OPEN: if the limiter isn't
 * configured (it needs the service-role key) or the database call errors, the request proceeds and the problem is
 * logged. For a storefront, availability matters more than strictness; Supabase Auth keeps its own limits too.
 */
export async function rateLimit(name: string, limit: number, windowSeconds: number): Promise<Limit> {
  if (!isAdminConfigured()) return { ok: true };
  try {
    const bucket = `${name}:${clientKey(await headers())}`;
    const { data, error } = await createAdminClient().rpc("rate_limit_check", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) throw new Error(error.message);
    const r = resultSchema.parse(data);
    if (r.allowed) return { ok: true };
    return { ok: false, message: `Too many attempts. Please try again in ${Math.max(1, r.retry_after)} seconds.` };
  } catch (e) {
    console.error("rate limiter unavailable, allowing request", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}
