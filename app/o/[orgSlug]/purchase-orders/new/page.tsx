import Link from "next/link";
import { redirect } from "next/navigation";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { loadVariantOptions } from "@/lib/variant-options";
import { Card, EmptyState } from "@/components/app/Panels";
import { PurchaseOrderForm } from "@/components/app/purchasing/PurchaseOrderForm";

export default async function NewPurchaseOrderPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  if (!hasRole(role, "manager")) redirect(`/o/${org.slug}/purchase-orders`);
  const [{ data: suppliers }, options] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("organization_id", org.id).eq("is_active", true).order("name"),
    loadVariantOptions(supabase, org.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/o/${org.slug}/purchase-orders`} className="text-sm text-muted hover:text-fg">← Purchase orders</Link>
        <h1 className="mt-2 font-display text-4xl">New purchase order</h1>
      </div>
      {!suppliers?.length || options.length === 0 ? (
        <Card title="Before you start">
          <EmptyState title={!suppliers?.length ? "Add a supplier first" : "Add a product first"}
            body={!suppliers?.length ? "A purchase order needs a supplier to order from." : "A purchase order needs products to order."} />
          <p className="text-center text-sm"><Link className="underline" href={`/o/${org.slug}/${!suppliers?.length ? "suppliers" : "products/new"}`}>{!suppliers?.length ? "Go to suppliers" : "Add a product"}</Link></p>
        </Card>
      ) : <PurchaseOrderForm slug={org.slug} suppliers={suppliers} options={options} currency={org.currency} />}
    </div>
  );
}
