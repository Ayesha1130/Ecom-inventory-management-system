import { hasRole, requireOrgAccess } from "@/lib/authz";
import { formatDateTime } from "@/lib/format";
import { parsePage } from "@/lib/query";
import { auditSchema } from "@/lib/validators/ops";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pagination } from "@/components/app/Pagination";

const PAGE_SIZE = 25;
const human = (a: string) => { const s = a.replace(/[._]/g, " "); return s[0]!.toUpperCase() + s.slice(1); };
const detail = (m: Record<string, unknown>) => Object.entries(m).map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");

export default async function AuditPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { orgSlug } = await params;
  const page = parsePage((await searchParams).page);
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  if (!hasRole(role, "admin")) return <Card title="Audit log"><EmptyState title="Admins only" body="Ask an admin or owner if you need to review activity." /></Card>;
  const { data, error } = await supabase.rpc("list_audit_logs", { p_org: org.id, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  if (error) throw new Error("Couldn't load the audit log.");
  const log = auditSchema.parse(data);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">An append-only record of important actions. Entries can&apos;t be edited or deleted.</p>
      {log.rows.length === 0 ? <Card title="Activity"><EmptyState title="No activity yet" body="Actions like role changes and refunds are recorded here." /></Card> : (
        <>
          <div className="panel overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Audit log</caption>
            <thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-3 font-normal">When</th><th className="px-4 py-3 font-normal">Who</th><th className="px-4 py-3 font-normal">Action</th></tr></thead>
            <tbody>{log.rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(r.created_at)}</td>
                <td className="px-4 py-3">{r.actor ?? "System"}</td>
                <td className="px-4 py-3">{human(r.action)}{Object.keys(r.metadata).length > 0 && <p className="mt-0.5 break-words text-xs text-muted">{detail(r.metadata)}</p>}</td>
              </tr>))}
            </tbody>
          </table></div>
          <Pagination basePath={`/o/${org.slug}/settings/audit`} params={{}} page={page} pageSize={PAGE_SIZE} total={log.total} />
        </>
      )}
    </div>
  );
}
