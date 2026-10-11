"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const live = [
  { label: "Dashboard", href: "" },
  { label: "Orders", href: "/orders" },
  { label: "Customers", href: "/customers" },
  { label: "Products", href: "/products" },
  { label: "Inventory", href: "/inventory" },
  { label: "Suppliers", href: "/suppliers" },
  { label: "Purchase orders", href: "/purchase-orders" },
  { label: "Analytics", href: "/analytics" },
  { label: "Storefront", href: "/storefront" },
  { label: "Settings", href: "/settings" },
];

export function Sidebar({ slug, horizontal = false }: { slug: string; horizontal?: boolean }) {
  const pathname = usePathname();
  const base = `/o/${slug}`;
  return (
    <nav aria-label="Workspace" className={horizontal ? "flex gap-1 overflow-x-auto px-4 py-2 text-sm" : "space-y-1 text-sm"}>
      {live.map((item) => {
        const href = base + item.href;
        const active = item.href === "" ? pathname === base : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={item.label} href={href} aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${horizontal ? "" : "block"} ${active ? "bg-white/8" : "text-muted hover:text-fg"}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
