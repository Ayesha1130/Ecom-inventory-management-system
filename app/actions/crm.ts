"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { friendlyDbError } from "@/lib/db-errors";
import { noteSchema, supplierSchema, type SupplierValues } from "@/lib/validators/ops";

type Result = { error?: string; ok?: boolean };
const slugSchema = z.string().min(3).max(40);

export async function addCustomerNoteAction(orgSlug: string, customerId: string, body: string): Promise<Result> {
  const { supabase, org, role, user } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "staff")) return { error: "You don't have permission to add notes." };
  const p = noteSchema.safeParse({ body });
  if (!p.success || !z.string().uuid().safeParse(customerId).success) return { error: p.success ? "Invalid customer." : p.error.issues[0]!.message };
  const { error } = await supabase.from("customer_notes").insert({ organization_id: org.id, customer_id: customerId, body: p.data.body, created_by: user.id });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/o/${org.slug}/customers/${customerId}`);
  return { ok: true };
}

export async function createSupplierAction(orgSlug: string, values: SupplierValues): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return { error: "You need manager access to add suppliers." };
  const p = supplierSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { error } = await supabase.from("suppliers").insert({
    organization_id: org.id, name: p.data.name, email: p.data.email || null, phone: p.data.phone || null, notes: p.data.notes || null,
  });
  if (error) return { error: error.code === "23505" ? "You already have a supplier with that name." : friendlyDbError(error) };
  revalidatePath(`/o/${org.slug}/suppliers`);
  return { ok: true };
}

export async function setSupplierActiveAction(orgSlug: string, supplierId: string, active: boolean): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return { error: "You need manager access to change suppliers." };
  if (!z.string().uuid().safeParse(supplierId).success) return { error: "Invalid supplier." };
  const { data, error } = await supabase.from("suppliers").update({ is_active: active }).eq("id", supplierId).eq("organization_id", org.id).select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "Supplier not found." };
  revalidatePath(`/o/${org.slug}/suppliers`);
  return { ok: true };
}
