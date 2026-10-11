import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

export function isAdminConfigured(): boolean {
  return !!getSupabaseEnv() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Service-role client: bypasses RLS. `server-only` makes bundling it into client code a build error.
 * Use it only to call the service_role-restricted SQL functions (order creation, webhooks, order lookup),
 * never to query tables directly.
 */
export function createAdminClient() {
  const env = getSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
