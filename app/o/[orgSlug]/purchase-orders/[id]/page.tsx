import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { formatDateTime, formatMoney } from "@/lib/format";
import { poDetailSchema } from "@/lib/validators/ops";
import { Card } from "@/components/app/Panels";
import { Pill } from "@/components/app/Pill";
import { PoActions } from "@/components/app/purchasing/PoActions";
import { poLabel, poTone } from "@/components/app/purchasing/po-status";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const { data } = await supabase.rpc("get_purchase_order", { p_org: org.id, p_po: id });
  if (!data) notFound();
  const d = poDetailSchema.parse(data);
  const { data: warehouses } = await supabase.from("warehouses").select("id, name").eq("organization_id", org.id).order("name");
  const total = d.items.reduce((s, i) => s + i.qty_ordered * i.unit_cost_cents, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href={`/o/${org.slug}/purchase-orders`} className="text-sm text-muted hover:text-fg">← Purchase orders</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl">PO-{d.po.po_number}</h1>
          <Pill tone={poTone[d.po.status] ?? "muted"}>{poLabel[d.po.status] ?? d.po.status}</Pill>
        </div>
        <p className="mt-1 text-sm text-muted">
          {d.supplier?.name ?? "Unknown supplier"} · created {formatDateTime(d.po.created_at)}
          {d.po.expected_at ? ` · expected ${d.po.expected_at}` : ""}{d.po.received_at ? ` · completed ${formatDateTime(d.po.received_at)}` : ""}
        </p>
        {d.po.notes && <p className="mt-2 text-sm">{d.po.notes}</p>}
      </div>

      {hasRole(role, "manager") && (
        <PoActions slug={org.slug} poId={d.po.id} status={d.po.status} items={d.items} warehouses={warehouses ?? []} />
      )}

      <Card title="Lines">
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Purchase order lines</caption>
          <thead className="text-xs text-muted"><tr><th className="pb-2 font-normal">Item</th><th className="pb-2 text-right font-normal">Ordered</th>
            <th className="pb-2 text-right font-normal">Received</th><th className="pb-2 text-right font-normal">Unit cost</th><th className="pb-2 text-right font-normal">Line total</th></tr></thead>
          <tbody>
            {d.items.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="py-2.5">{i.product}{i.variant ? <span className="text-muted"> · {i.variant}</span> : null}<p className="font-mono text-xs text-muted">{i.sku}</p></td>
                <td className="py-2.5 text-right font-mono">{i.qty_ordered}</td>
                <td className="py-2.5 text-right font-mono">{i.qty_received}</td>
                <td className="py-2.5 text-right font-mono">{formatMoney(i.unit_cost_cents, org.currency)}</td>
                <td className="py-2.5 text-right font-mono">{formatMoney(i.qty_ordered * i.unit_cost_cents, org.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="mt-3 border-t border-line pt-3 text-right text-sm font-medium">Total <span className="ml-2 font-mono">{formatMoney(total, org.currency)}</span></p>
      </Card>
    </div>
  );
}
