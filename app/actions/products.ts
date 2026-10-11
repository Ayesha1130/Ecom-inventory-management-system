"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { friendlyDbError } from "@/lib/db-errors";
import { MAX_IMAGE_BYTES, detectImageType } from "@/lib/image-type";
import { slugify } from "@/lib/slug";
import { IMAGE_BUCKET } from "@/lib/storage";
import { idsSchema, productFormSchema, toRpcPayload, type ProductFormValues } from "@/lib/validators/product";

type Result = { error?: string; id?: string; ok?: boolean };
const NEEDS_MANAGER: Result = { error: "You need manager access to change the catalog." };
const slugSchema = z.string().min(3).max(40);

export async function saveProductAction(orgSlug: string, productId: string | null, values: ProductFormValues): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const parsed = productFormSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  if (productId && !z.string().uuid().safeParse(productId).success) return { error: "Invalid product." };

  let categoryId = parsed.data.category_id;
  if (parsed.data.new_category) {
    const cslug = slugify(parsed.data.new_category);
    if (!cslug) return { error: "Enter a valid category name." };
    await supabase.from("categories").upsert(
      { organization_id: org.id, name: parsed.data.new_category, slug: cslug },
      { onConflict: "organization_id,slug", ignoreDuplicates: true },
    );
    const { data: cat } = await supabase.from("categories").select("id").eq("organization_id", org.id).eq("slug", cslug).maybeSingle();
    if (!cat) return { error: "Couldn't create that category." };
    categoryId = cat.id;
  }

  const { data, error } = await supabase.rpc("save_product", {
    p_org: org.id, p_id: productId, p_data: toRpcPayload(parsed.data, categoryId),
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(`/o/${org.slug}/products`);
  revalidatePath(`/o/${org.slug}/inventory`);
  if (!productId) redirect(`/o/${org.slug}/products/${data as string}`);
  return { ok: true, id: data as string };
}

export async function bulkStatusAction(orgSlug: string, ids: string[], status: "draft" | "active" | "archived"): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const list = idsSchema.safeParse(ids);
  if (!list.success) return { error: "Select between 1 and 100 products." };
  const { error } = await supabase.from("products").update({ status }).eq("organization_id", org.id).in("id", list.data);
  if (error) return { error: friendlyDbError(error) };
  await supabase.rpc("log_audit", { p_org: org.id, p_action: `product.bulk_${status}`, p_entity_type: "product", p_metadata: { count: list.data.length } });
  revalidatePath(`/o/${org.slug}/products`);
  return { ok: true };
}

export async function deleteProductsAction(orgSlug: string, ids: string[]): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  const list = idsSchema.safeParse(ids);
  if (!list.success) return { error: "Select between 1 and 100 products." };

  const { data: images } = await supabase.from("product_images").select("path").eq("organization_id", org.id).in("product_id", list.data);
  const { error } = await supabase.from("products").delete().eq("organization_id", org.id).in("id", list.data); // one statement: all or nothing
  if (error) return { error: friendlyDbError(error) };
  if (images?.length) await supabase.storage.from(IMAGE_BUCKET).remove(images.map((i) => i.path));
  await supabase.rpc("log_audit", { p_org: org.id, p_action: "product.deleted", p_entity_type: "product", p_metadata: { count: list.data.length } });
  revalidatePath(`/o/${org.slug}/products`);
  return { ok: true };
}

const MAX_IMAGES = 10;

export async function uploadProductImageAction(formData: FormData): Promise<Result> {
  const orgSlug = slugSchema.safeParse(formData.get("slug"));
  const productId = z.string().uuid().safeParse(formData.get("productId"));
  const file = formData.get("file");
  if (!orgSlug.success || !productId.success) return { error: "Invalid request." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Images must be 5 MB or smaller." };

  const { supabase, org, role } = await requireOrgAccess(orgSlug.data);
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;

  const type = detectImageType(new Uint8Array(await file.arrayBuffer()).subarray(0, 16));
  if (!type) return { error: "Only JPEG, PNG or WebP images are allowed." };

  const { data: product } = await supabase.from("products").select("id").eq("id", productId.data).eq("organization_id", org.id).maybeSingle();
  if (!product) return { error: "Product not found." };
  const { count } = await supabase.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", product.id);
  if ((count ?? 0) >= MAX_IMAGES) return { error: `A product can have up to ${MAX_IMAGES} images.` };

  const path = `${org.id}/${product.id}/${randomUUID()}.${type.ext}`; // server-chosen name, extension from detected type
  const { error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: type.mime, upsert: false });
  if (upErr) return { error: "Upload failed. Please try again." };

  const alt = String(formData.get("alt") ?? "").trim().slice(0, 200);
  const { error } = await supabase.from("product_images").insert({
    organization_id: org.id, product_id: product.id, path, alt, position: count ?? 0,
  });
  if (error) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path]); // don't leave orphans behind
    return { error: friendlyDbError(error) };
  }
  revalidatePath(`/o/${org.slug}/products`);
  return { ok: true };
}

export async function deleteProductImageAction(orgSlug: string, imageId: string): Promise<Result> {
  const { supabase, org, role } = await requireOrgAccess(slugSchema.parse(orgSlug));
  if (!hasRole(role, "manager")) return NEEDS_MANAGER;
  if (!z.string().uuid().safeParse(imageId).success) return { error: "Invalid image." };
  const { data: img } = await supabase.from("product_images").select("path").eq("id", imageId).eq("organization_id", org.id).maybeSingle();
  if (!img) return { error: "Image not found." };
  const { error } = await supabase.from("product_images").delete().eq("id", imageId).eq("organization_id", org.id);
  if (error) return { error: friendlyDbError(error) };
  await supabase.storage.from(IMAGE_BUCKET).remove([img.path]);
  revalidatePath(`/o/${org.slug}/products`);
  return { ok: true };
}
