import Link from "next/link";
import { requireOrgAccess } from "@/lib/authz";
import { signOutAction } from "@/app/actions/auth";
import { DemoTour } from "@/components/app/DemoTour";
import { Sidebar } from "@/components/app/Sidebar";
import { DEMO_STORE_SLUG } from "@/lib/demo";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { supabase, org, role, readOnly, user } = await requireOrgAccess(orgSlug);
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("organization_id", org.id).is("read_at", null);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-surface p-4 md:block">
        <Link href="/" className="mb-6 block px-3 font-display text-2xl">Nexora</Link>
        <Sidebar slug={org.slug} />
      </aside>
      <div className="min-w-0">
        {readOnly && (
          <div role="status" className="border-b border-warn/30 bg-warn/10 px-6 py-2 text-sm text-warn">
            Read-only demo with simulated data. {org.is_demo && <><DemoTour slug={org.slug} storeSlug={DEMO_STORE_SLUG} />{" · "}</>}{user.is_anonymous && <><Link href="/signup" className="underline">Create an account</Link> to build your own workspace.</>}
          </div>
        )}
        <header className="flex h-14 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-xl md:hidden">Nexora</Link>
            <span className="text-sm font-medium">{org.name}</span>
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-muted">{role ?? "demo viewer"}</span>
          </div>
          <div className="flex items-center gap-5">
          <Link href={`/o/${org.slug}/notifications`} className="relative text-sm text-muted transition-colors hover:text-fg" aria-label={`Notifications, ${unread ?? 0} unread`}>
            Alerts{!!unread && <span className="ml-1.5 rounded-full bg-violet px-1.5 py-0.5 text-xs text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <form action={signOutAction}>
            <button className="text-sm text-muted transition-colors hover:text-fg">
              {user.is_anonymous ? "Exit demo" : "Sign out"}
            </button>
          </form>
          </div>
        </header>
        <div className="border-b border-line md:hidden"><Sidebar slug={org.slug} horizontal /></div>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
