"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { friendlyDbError } from "@/lib/db-errors";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { invitationEmail } from "@/lib/emails";
import { getSiteOrigin } from "@/lib/site";
import { TOKEN_RE, newCartToken } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema, roleSchema, type InviteValues } from "@/lib/validators/ops";

type Result = { error?: string; ok?: boolean };
const slugSchema = z.string().min(3).max(40);
const id = z.string().uuid();
const done = (slug: string): Result => { revalidatePath(`/o/${slug}/settings/team`); revalidatePath(`/o/${slug}/settings/audit`); return { ok: true }; };

/** Returns the invite link so the inviter can share it even when email isn't configured. */
export async function inviteMemberAction(orgSlug: string, values: InviteValues): Promise<Result & { link?: string; emailed?: boolean }> {
  const { supabase, org, role, user } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "admin")) return { error: "You need admin access to invite people." };
  const p = inviteSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };

  const token = newCartToken(); // 256 bits; only its hash is stored
  const { error } = await supabase.rpc("create_invitation", { p_org: org.id, p_email: p.data.email, p_role: p.data.role, p_token: token });
  if (error) return { error: friendlyDbError(error) };

  const link = `${await getSiteOrigin()}/invite/${token}`;
  let emailed = false;
  try {
    const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    emailed = (await sendEmail({ to: p.data.email, ...invitationEmail({ organization: org.name, role: p.data.role, inviter: me?.full_name ?? null, link }) })).sent;
  } catch (e) {
    console.error("invitation email failed", e instanceof Error ? e.message : e);
  }
  done(org.slug);
  return { ok: true, link, emailed };
}

export async function revokeInvitationAction(orgSlug: string, invitationId: string): Promise<Result> {
  const { supabase, org } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!id.safeParse(invitationId).success) return { error: "Invalid invitation." };
  const { error } = await supabase.rpc("revoke_invitation", { p_org: org.id, p_invitation: invitationId });
  return error ? { error: friendlyDbError(error) } : done(org.slug);
}

export async function changeMemberRoleAction(orgSlug: string, userId: string, role: string): Promise<Result> {
  const { supabase, org } = await requireOrgAccess(slugSchema.parse(orgSlug));
  const r = roleSchema.safeParse(role);
  if (!r.success || !id.safeParse(userId).success) return { error: "Invalid request." };
  const { error } = await supabase.rpc("change_member_role", { p_org: org.id, p_user: userId, p_role: r.data });
  return error ? { error: friendlyDbError(error) } : done(org.slug);
}

export async function removeMemberAction(orgSlug: string, userId: string): Promise<Result> {
  const { supabase, org, user } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!id.safeParse(userId).success) return { error: "Invalid request." };
  const { error } = await supabase.rpc("remove_member", { p_org: org.id, p_user: userId });
  if (error) return { error: friendlyDbError(error) };
  if (userId === user.id) redirect("/onboarding?new=1"); // you just lost access to this workspace
  return done(org.slug);
}

export async function acceptInviteAction(token: string): Promise<Result> {
  if (!TOKEN_RE.test(token)) return { error: "This invitation link is invalid." };
  const limited = await rateLimit("invite", 10, 600);
  if (!limited.ok) return { error: limited.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: friendlyDbError(error).replace("That item no longer exists. Refresh and try again.", "This invitation is invalid or has expired.") };
  redirect(`/o/${(data as { slug: string }).slug}`);
}

export async function markNotificationsReadAction(orgSlug: string): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "staff")) return { error: "Demo viewers can't change notifications." };
  const { error } = await supabase.rpc("mark_notifications_read", { p_org: org.id });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/o/${org.slug}`, "layout");
  return { ok: true };
}
