import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";

/** Stateless anon client for the storefront: never reads or writes the staff session cookie. */
export function createPublicClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase is not configured. Copy .env.example to .env.local and fill it in.");
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
