"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [["team", "Team"], ["roles", "Roles & permissions"], ["audit", "Audit log"], ["billing", "Billing"]] as const;

export function SettingsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex flex-wrap gap-2 text-sm">
      {tabs.map(([key, label]) => {
        const href = `/o/${slug}/settings/${key}`;
        const active = pathname === href;
        return (
          <Link key={key} href={href} aria-current={active ? "page" : undefined}
            className={`rounded-full border border-line px-3.5 py-1.5 ${active ? "bg-white/10" : "text-muted hover:text-fg"}`}>{label}</Link>
        );
      })}
      <Link href={`/o/${slug}/storefront`} className="rounded-full border border-line px-3.5 py-1.5 text-muted hover:text-fg">Storefront</Link>
    </nav>
  );
}
