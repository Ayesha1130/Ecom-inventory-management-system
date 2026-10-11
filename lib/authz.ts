import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "staff" | "manager" | "admin" | "owner";

/**
 * Resolves the org for a URL slug and the caller's membership. The slug is untrusted input:
 * RLS decides what the caller can see, and non-members get a 404 so existence isn't leaked.
 */
export const requireOrgAccess = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/o/${slug}`)}`);

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, is_demo, currency")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (member?.role as Role | undefined) ?? null;
  if (!role && !org.is_demo) notFound();

  return {
    supabase,
    user,
    org: org as { id: string; name: string; slug: string; is_demo: boolean; currency: string },
    role,
    readOnly: role === null,
  };
});

const rank: Record<Role, number> = { staff: 0, manager: 1, admin: 2, owner: 3 };
/** UI/server pre-check only. The database re-checks every write with is_member(). */
export function hasRole(role: Role | null, min: Role): boolean {
  return role !== null && rank[role] >= rank[min];
}
