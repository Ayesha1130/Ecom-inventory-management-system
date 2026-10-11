import Link from "next/link";
import { redirect } from "next/navigation";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { ProductForm, emptyVariant } from "@/components/app/products/ProductForm";

export default async function NewProductPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  if (!hasRole(role, "manager")) redirect(`/o/${org.slug}/products`);
  const { data: categories } = await supabase.from("categories").select("id, name").eq("organization_id", org.id).order("name");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/o/${org.slug}/products`} className="text-sm text-muted hover:text-fg">← Products</Link>
        <h1 className="mt-2 font-display text-4xl">New product</h1>
        <p className="mt-1 text-sm text-muted">Add images and starting stock after you save.</p>
      </div>
      <ProductForm slug={org.slug} productId={null} categories={categories ?? []} canWrite
        defaults={{ name: "", slug: "", description: "", status: "draft", category_id: "", new_category: "", variants: [emptyVariant] }} />
    </div>
  );
}
