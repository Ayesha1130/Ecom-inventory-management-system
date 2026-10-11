import Link from "next/link";
import type { StoreInfo } from "@/lib/validators/storefront";

export function StoreHeader({ slug, info, cartCount }: { slug: string; info: StoreInfo; cartCount: number }) {
  const base = `/s/${slug}`;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href={base} className="font-display text-2xl tracking-tight">{info.name}</Link>
        <nav aria-label="Shop" className="hidden items-center gap-6 text-sm md:flex">
          <Link href={`${base}/products`} className="hover:underline">Shop all</Link>
          {info.categories.map((c) => <Link key={c.slug} href={`${base}/c/${c.slug}`} className="hover:underline">{c.name}</Link>)}
        </nav>
        <Link href={`${base}/cart`} className="flex items-center gap-2 text-sm hover:underline" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}>
          Cart
          <span className="grid min-w-5 place-items-center rounded-full bg-violet px-1.5 py-0.5 text-xs text-white">{cartCount}</span>
        </Link>
      </div>
      <nav aria-label="Shop (mobile)" className="flex gap-5 overflow-x-auto border-t border-line px-5 py-2.5 text-sm md:hidden">
        <Link href={`${base}/products`} className="whitespace-nowrap">Shop all</Link>
        {info.categories.map((c) => <Link key={c.slug} href={`${base}/c/${c.slug}`} className="whitespace-nowrap">{c.name}</Link>)}
      </nav>
    </header>
  );
}
