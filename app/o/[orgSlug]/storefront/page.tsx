import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { StorefrontForm } from "@/components/app/StorefrontForm";

export default async function StorefrontSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const [store, products] = await Promise.all([
    supabase.from("stores").select("slug, name, tagline, is_published").eq("organization_id", org.id).maybeSingle(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active"),
  ]);
  if (!store.data) notFound();
  const s = store.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Storefront</h1>
        <p className="mt-1 text-sm text-muted">
          {s.is_published ? "Live at" : "Not published. It will be live at"}{" "}
          <code className="font-mono text-fg">/s/{s.slug}</code>.
          {" "}{products.count ?? 0} active product{products.count === 1 ? "" : "s"} will be visible.
        </p>
        {s.is_published && <Link href={`/s/${s.slug}`} className="mt-3 inline-block text-sm underline">Open storefront</Link>}
      </div>
      <StorefrontForm slug={org.slug} canEdit={hasRole(role, "admin")}
        defaults={{ name: s.name, tagline: s.tagline ?? "", is_published: s.is_published }} />
    </div>
  );
}
