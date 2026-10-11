import Link from "next/link";
import { requireOrgAccess } from "@/lib/authz";
import { formatDateTime } from "@/lib/format";
import { parsePage } from "@/lib/query";
import { movementsSchema } from "@/lib/validators/catalog";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pagination } from "@/components/app/Pagination";

const PAGE_SIZE = 25;
const reasonLabel: Record<string, string> = {
  initial: "Opening stock", restock: "Restock", sale: "Sale", return: "Return", adjustment: "Correction",
  damage: "Damaged / lost", transfer_in: "Transfer in", transfer_out: "Transfer out",
};

export default async function MovementsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { orgSlug } = await params;
  const page = parsePage((await searchParams).page);
  const { supabase, org } = await requireOrgAccess(orgSlug);
  const { data, error } = await supabase.rpc("list_movements", { p_org: org.id, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  if (error) throw new Error("Couldn't load stock history.");
  const m = movementsSchema.parse(data);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href={`/o/${org.slug}/inventory`} className="text-sm text-muted hover:text-fg">← Inventory</Link>
        <h1 className="mt-2 font-display text-4xl">Stock history</h1>
        <p className="mt-1 text-sm text-muted">Every change to stock, newest first. Entries can&apos;t be edited or deleted.</p>
      </div>
      {m.rows.length === 0 ? (
        <Card title="Movements"><EmptyState title="No stock changes yet" body="Adjustments, transfers and sales appear here." /></Card>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Inventory movements</caption>
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-normal">When</th><th className="px-4 py-3 font-normal">Item</th>
                  <th className="px-4 py-3 font-normal">Location</th><th className="px-4 py-3 font-normal">Reason</th>
                  <th className="px-4 py-3 text-right font-normal">Change</th><th className="px-4 py-3 font-normal">By</th>
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-muted">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-3"><p>{r.product}</p><p className="font-mono text-xs text-muted">{r.sku}</p></td>
                    <td className="px-4 py-3 text-muted">{r.warehouse}</td>
                    <td className="px-4 py-3">{reasonLabel[r.reason] ?? r.reason}{r.note ? <span className="block text-xs text-muted">{r.note}</span> : null}</td>
                    <td className={`px-4 py-3 text-right font-mono ${r.delta > 0 ? "text-cyan" : "text-red-300"}`}>{r.delta > 0 ? "+" : ""}{r.delta}</td>
                    <td className="px-4 py-3 text-muted">{r.actor ?? "System"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath={`/o/${org.slug}/inventory/movements`} params={{}} page={page} pageSize={PAGE_SIZE} total={m.total} />
        </>
      )}
    </div>
  );
}
