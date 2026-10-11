import { getSupabaseEnv } from "@/lib/env";

export function ConfigNotice() {
  if (getSupabaseEnv()) return null;
  return (
    <p role="status" className="mb-6 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
      Supabase isn&apos;t configured in this environment, so sign-in is disabled. Add the variables from
      .env.example to .env.local.
    </p>
  );
}
