import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { productSchema } from "@/lib/validators/storefront";
import { ProductPurchase } from "@/components/store/ProductPurchase";

async function load(storeSlug: string, slug: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) notFound();
  const { data, error } = await createPublicClient().rpc("storefront_product", { p_store: storeSlug, p_slug: slug });
  if (error) throw new Error("Couldn't load the product.");
  if (!data) notFound();
  return productSchema.parse(data);
}

export async function generateMetadata({ params }: { params: Promise<{ storeSlug: string; slug: string }> }): Promise<Metadata> {
  const { storeSlug, slug } = await params;
  await requireStore(storeSlug);
  const p = await load(storeSlug, slug);
  return { title: p.name, description: p.description?.slice(0, 160) };
}

export default async function ProductPage({ params }: { params: Promise<{ storeSlug: string; slug: string }> }) {
  const { storeSlug, slug } = await params;
  const [info, product] = await Promise.all([requireStore(storeSlug), load(storeSlug, slug)]);
  if (product.variants.length === 0) notFound();
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <Link href={`/s/${storeSlug}/products`} className="hover:underline">Shop</Link>
        {product.category && product.category_slug && (
          <> / <Link href={`/s/${storeSlug}/c/${product.category_slug}`} className="hover:underline">{product.category}</Link></>
        )}
      </nav>
      <ProductPurchase slug={storeSlug} product={product} currency={info.currency} />
    </div>
  );
}
