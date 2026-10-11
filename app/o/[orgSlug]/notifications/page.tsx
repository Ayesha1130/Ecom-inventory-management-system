import Link from "next/link";
import { hasRole, requireOrgAccess } from "@/lib/authz";
import { formatDateTime } from "@/lib/format";
import { Card, EmptyState } from "@/components/app/Panels";
import { MarkRead } from "@/components/app/MarkRead";

export default async function NotificationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { supabase, org, role } = await requireOrgAccess(orgSlug);
  const { data } = await supabase.from("notifications").select("id, type, title, body, entity_id, read_at, created_at")
    .eq("organization_id", org.id).order("created_at", { ascending: false }).limit(50);
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  const href = (n: { type: string; entity_id: string | null }) =>
    n.type === "new_order" && n.entity_id ? `/o/${org.slug}/orders/${n.entity_id}` : `/o/${org.slug}/inventory?low=1`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-4xl">Notifications</h1><p className="mt-1 text-sm text-muted">{unread} unread. Low-stock alerts and new paid orders appear here.</p></div>
        {unread > 0 && hasRole(role, "staff") && <MarkRead slug={org.slug} />}
      </div>
      {items.length === 0 ? <Card title="Inbox"><EmptyState title="Nothing yet" body="You'll be notified when stock runs low or an order is paid." /></Card> : (
        <ul className="panel divide-y divide-line">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={href(n)} className="flex items-start gap-3 px-5 py-4 hover:bg-white/4">
                <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-violet"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.read_at ? "text-muted" : ""}`}>{n.title}<span className="sr-only">{n.read_at ? "" : " (unread)"}</span></span>
                  {n.body && <span className="block text-xs text-muted">{n.body}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{formatDateTime(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
