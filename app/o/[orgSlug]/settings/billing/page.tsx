import { requireOrgAccess } from "@/lib/authz";
import { Card } from "@/components/app/Panels";
import { Pill } from "@/components/app/Pill";

export default async function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, org } = await requireOrgAccess(orgSlug);
  const { data } = await supabase.from("subscriptions").select("plan, status").eq("organization_id", org.id).maybeSingle();
  return (
    <Card title="Plan">
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl capitalize">{data?.plan ?? "free"}</span>
        <Pill tone="muted">{data?.status ?? "trialing"}</Pill>
      </div>
      <p className="mt-4 rounded-lg border border-line bg-white/4 p-4 text-sm text-muted">
        Billing isn&apos;t connected. Nexora is a portfolio project, so no payment method is collected, no invoices are issued and no plan limits are enforced.
        The plan shown is just a record on your workspace.
      </p>
    </Card>
  );
}
