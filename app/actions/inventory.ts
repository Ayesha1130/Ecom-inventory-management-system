"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { friendlyDbError } from "@/lib/db-errors";
import {
  adjustDelta, adjustSchema, thresholdSchema, transferSchema, warehouseSchema,
  type AdjustValues, type ThresholdValues, type TransferValues, type WarehouseValues,
} from "@/lib/validators/inventory";

type Result = { error?: string; ok?: boolean };
const NEEDS_MANAGER: Result = { error: "You need manager access to change stock." };
const slugSchema = z.string().min(3).max(40);

export async function adjustStockAction(orgSlug: string, values: AdjustValues): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const p = adjustSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { error } = await supabase.rpc("adjust_stock", {
    p_org: org.id, p_variant: p.data.variantId, p_warehouse: p.data.warehouseId,
    p_delta: adjustDelta(p.data), p_reason: p.data.reason, p_note: p.data.note || null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/o/${org.slug}/inventory`, "layout");
  revalidatePath(`/o/${org.slug}`);
  return { ok: true };
}

export async function transferStockAction(orgSlug: string, values: TransferValues): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const p = transferSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { error } = await supabase.rpc("transfer_stock", {
    p_org: org.id, p_variant: p.data.variantId, p_from: p.data.fromId, p_to: p.data.toId,
    p_qty: Number(p.data.quantity), p_note: p.data.note || null,
  });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/o/${org.slug}/inventory`, "layout");
  return { ok: true };
}

export async function setThresholdAction(orgSlug: string, values: ThresholdValues): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const p = thresholdSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { data, error } = await supabase.from("product_variants")
    .update({ low_stock_threshold: Number(p.data.threshold) })
    .eq("id", p.data.variantId).eq("organization_id", org.id).select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data?.length) return { error: "That item no longer exists." };
  revalidatePath(`/o/${org.slug}/inventory`);
  revalidatePath(`/o/${org.slug}`);
  return { ok: true };
}

export async function createWarehouseAction(orgSlug: string, values: WarehouseValues): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const p = warehouseSchema.safeParse(values);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const { error } = await supabase.from("warehouses").insert({ organization_id: org.id, name: p.data.name, code: p.data.code.toUpperCase() });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/o/${org.slug}/inventory`);
  return { ok: true };
}
