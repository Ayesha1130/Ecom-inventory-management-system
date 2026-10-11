import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { fromCents } from "@/lib/money";
import { ProductForm } from "@/components/app/products/ProductForm";
import { ImageManager } from "@/components/app/products/ImageManager";

export default async function EditProductPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const canWrite = hasRole(role, "manager");

  const [product, variants, images, categories] = await Promise.all([
    supabase.from("products").select("id, name, slug, description, status, category_id").eq("id", id).eq("organization_id", org.id).maybeSingle(),
    supabase.from("product_variants").select("id, sku, option_size, option_color, price_cents, sale_price_cents, cost_cents, low_stock_threshold").eq("product_id", id).eq("organization_id", org.id).order("sku"),
    supabase.from("product_images").select("id, path, alt").eq("product_id", id).eq("organization_id", org.id).order("position").order("created_at"),
    supabase.from("categories").select("id, name").eq("organization_id", org.id).order("name"),
  ]);
  if (!product.data) notFound();
  const p = product.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/o/${org.slug}/products`} className="text-sm text-muted hover:text-fg">← Products</Link>
        <h1 className="mt-2 font-display text-4xl">{p.name}</h1>
      </div>
      <ProductForm
        slug={org.slug} productId={p.id} canWrite={canWrite} categories={categories.data ?? []}
        defaults={{
          name: p.name, slug: p.slug, description: p.description ?? "", status: p.status,
          category_id: p.category_id ?? "", new_category: "",
          variants: (variants.data ?? []).map((v) => ({
            variantId: v.id, sku: v.sku, option_size: v.option_size ?? "", option_color: v.option_color ?? "",
            price: fromCents(v.price_cents), sale_price: fromCents(v.sale_price_cents), cost: fromCents(v.cost_cents),
            low_stock_threshold: String(v.low_stock_threshold),
          })),
        }}
      />
      <ImageManager slug={org.slug} productId={p.id} canWrite={canWrite}
        images={(images.data ?? []).map((i) => ({ id: i.id, path: i.path, alt: i.alt }))} />
    </div>
  );
}
