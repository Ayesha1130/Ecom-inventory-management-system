import { requireOrgAccess, type Role } from "@/lib/authz";
import { memberListSchema } from "@/lib/validators/ops";
import { TeamManager } from "@/components/app/team/TeamManager";

export default async function TeamPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const [members, invites] = await Promise.all([
    supabase.rpc("list_members", { p_org: org.id }),
    // RLS returns invitations to admins only; everyone else gets an empty list
    supabase.from("invitations").select("id, email, role, expires_at").eq("organization_id", org.id).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);
  if (members.error) throw new Error("Couldn't load the team.");
  if (!role) return <p className="text-sm text-muted">Team management isn&apos;t available in the read-only demo.</p>;
  return <TeamManager slug={org.slug} members={memberListSchema.parse(members.data)} invitations={invites.data ?? []} myRole={role as Role} />;
}
