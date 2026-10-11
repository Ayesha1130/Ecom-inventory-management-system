"use server";
import { revalidatePath } from "next/cache";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { friendlyDbError } from "@/lib/db-errors";
import { storeSettingsSchema, type StoreSettingsValues } from "@/lib/validators/store";

export async function updateStoreAction(orgSlug: string, values: StoreSettingsValues): Promise<{ error?: string; ok?: boolean }> {
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  if (!hasRole(role, "admin")) return { error: "You need admin access to change storefront settings." };
  const p = storeSettingsSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };

  const { data, error } = await supabase.from("stores")
    .update({ name: p.data.name, tagline: p.data.tagline || null, is_published: p.data.is_published })
    .eq("organization_id", org.id).select("slug");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Store not found." };
  await supabase.rpc("log_audit", { p_org: org.id, p_action: p.data.is_published ? "store.published" : "store.updated", p_entity_type: "store" });
  revalidatePath(`/s/${data[0]!.slug}`, "layout");
  revalidatePath(`/o/${org.slug}/storefront`);
  return { ok: true };
}
