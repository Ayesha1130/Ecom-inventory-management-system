import Link from "next/link";
import { requireOrgAccess } from "@/lib/authz";
import { formatDateTime, formatMoney } from "@/lib/format";
import { buildHref, parsePage } from "@/lib/query";
import { customerListSchema } from "@/lib/validators/ops";
import { Card, EmptyState } from "@/components/app/Panels";
import { Pagination } from "@/components/app/Pagination";
import { Pill, type Tone } from "@/components/app/Pill";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 25;
const SEGMENTS = [["", "All"], ["vip", "VIP"], ["returning", "Returning"], ["new", "New"], ["prospect", "No purchases"]] as const;
const tone: Record<string, Tone> = { vip: "violet", returning: "good", new: "good", prospect: "muted" };
const label: Record<string, string> = { vip: "VIP", returning: "Returning", new: "New", prospect: "No purchases" };
const SORTS = { spent: "Highest spend", recent: "Most recent order", name: "Name" } as const;

export default async function CustomersPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { supabase, org } = await requireOrgAccess(orgSlug);
  const q = (sp.q ?? "").slice(0, 100);
  const segment = SEGMENTS.find(([k]) => k === sp.segment)?.[0] ?? "";
  const sort = sp.sort && sp.sort in SORTS ? (sp.sort as keyof typeof SORTS) : "spent";
  const page = parsePage(sp.page);

  const { data, error } = await supabase.rpc("list_customers", {
    p_org: org.id, p_search: q || null, p_segment: segment || null, p_sort: sort, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error("Couldn't load customers.");
  const list = customerListSchema.parse(data);
  const base = `/o/${org.slug}/customers`;
  const all = Object.values(list.segments).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Customers</h1>
        <p className="mt-1 text-sm text-muted">Segments are calculated from paid orders, net of refunds. VIP means $500 or more.</p>
      </div>
      <nav aria-label="Segments" className="flex flex-wrap gap-2 text-sm">
        {SEGMENTS.map(([key, name]) => (
          <Link key={key || "all"} href={buildHref(base, { segment: key || undefined, q, sort: sort === "spent" ? undefined : sort })}
            aria-current={key === segment ? "page" : undefined}
            className={`rounded-full border border-line px-3.5 py-1.5 ${key === segment ? "bg-white/10" : "text-muted hover:text-fg"}`}>
            {name} <span className="font-mono text-xs text-muted">{key ? (list.segments[key] ?? 0) : all}</span>
          </Link>
        ))}
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        {segment && <input type="hidden" name="segment" value={segment} />}
        <div className="w-full sm:w-72"><Field id="q" name="q" label="Search" placeholder="Name or email" defaultValue={q} /></div>
        <div className="w-48">
          <SelectField id="sort" name="sort" label="Sort by" defaultValue={sort}>
            {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => <option key={k} value={k}>{SORTS[k]}</option>)}
          </SelectField>
        </div>
        <Button type="submit" variant="ghost">Apply</Button>
      </form>

      {list.rows.length === 0 ? (
        <Card title="Customers"><EmptyState title={q || segment ? "No customers match" : "No customers yet"} body="Customers are created automatically at checkout." /></Card>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Customers</caption>
              <thead className="border-b border-line text-xs text-muted"><tr>
                <th className="px-4 py-3 font-normal">Customer</th><th className="px-4 py-3 font-normal">Segment</th>
                <th className="px-4 py-3 text-right font-normal">Orders</th><th className="px-4 py-3 text-right font-normal">Total spent</th>
                <th className="px-4 py-3 font-normal">Last order</th></tr></thead>
              <tbody>
                {list.rows.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3"><Link href={`${base}/${c.id}`} className="hover:underline">{c.full_name}</Link><p className="text-xs text-muted">{c.email}</p></td>
                    <td className="px-4 py-3"><Pill tone={tone[c.segment] ?? "muted"}>{label[c.segment] ?? c.segment}</Pill></td>
                    <td className="px-4 py-3 text-right font-mono">{c.orders}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(c.spent_cents, org.currency)}</td>
                    <td className="px-4 py-3 text-muted">{c.last_order_at ? formatDateTime(c.last_order_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath={base} params={{ segment: segment || undefined, q, sort: sort === "spent" ? undefined : sort }} page={page} pageSize={PAGE_SIZE} total={list.total} />
        </>
      )}
    </div>
  );
}
