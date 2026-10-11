"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { friendlyDbError } from "@/lib/db-errors";
import { toCents } from "@/lib/money";
import { poFormSchema, receiveSchema, type PoFormValues } from "@/lib/validators/ops";

type Result = { error?: string; ok?: boolean };
const slugSchema = z.string().min(3).max(40);
const id = z.string().uuid();
const NEEDS_MANAGER: Result = { error: "You need manager access to manage purchase orders." };

function refresh(slug: string, poId?: string) {
  revalidatePath(`/o/${slug}/purchase-orders`);
  if (poId) revalidatePath(`/o/${slug}/purchase-orders/${poId}`);
  revalidatePath(`/o/${slug}/inventory`, "layout");
  revalidatePath(`/o/${slug}`);
}

export async function createPurchaseOrderAction(orgSlug: string, values: PoFormValues, place: boolean): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const p = poFormSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_org: org.id, p_supplier: p.data.supplierId, p_expected: p.data.expectedAt || null, p_notes: p.data.notes || null, p_place: place,
    p_items: p.data.lines.map((l) => ({ variant_id: l.variantId, quantity: Number(l.quantity), unit_cost_cents: toCents(l.unitCost) })),
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(org.slug);
  redirect(`/o/${org.slug}/purchase-orders/${data as string}`);
}

async function simple(orgSlug: string, poId: string, fn: "place_purchase_order" | "cancel_purchase_order"): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  if (!id.safeParse(poId).success) return { error: "Invalid purchase order." };
  const { error } = await supabase.rpc(fn, { p_org: org.id, p_po: poId });
  if (error) return { error: friendlyDbError(error) };
  refresh(org.slug, poId);
  return { ok: true };
}
export async function placePurchaseOrderAction(orgSlug: string, poId: string): Promise<Result> {
  return simple(orgSlug, poId, "place_purchase_order");
}
export async function cancelPurchaseOrderAction(orgSlug: string, poId: string): Promise<Result> {
  return simple(orgSlug, poId, "cancel_purchase_order");
}

export async function receivePurchaseOrderAction(orgSlug: string, poId: string, input: { warehouseId: string; lines: { itemId: string; quantity: number }[] }): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const p = receiveSchema.safeParse(input);
  if (!p.success || !id.safeParse(poId).success) return { error: "Choose a warehouse and at least one line to receive." };
  const { error } = await supabase.rpc("receive_purchase_order", {
    p_org: org.id, p_po: poId, p_warehouse: p.data.warehouseId,
    p_lines: p.data.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
  });
  if (error) return { error: friendlyDbError(error) };
  refresh(org.slug, poId);
  return { ok: true };
}
