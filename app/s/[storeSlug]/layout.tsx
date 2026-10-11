import type { Metadata } from "next";
import Link from "next/link";
import { getCart, requireStore } from "@/lib/store";
import { StoreHeader } from "@/components/store/StoreHeader";

export async function generateMetadata({ params }: { params: Promise<{ storeSlug: string }> }): Promise<Metadata> {
  const info = await requireStore((await params).storeSlug);
  return { title: { default: info.name, template: `%s · ${info.name}` }, description: info.tagline ?? undefined };
}

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const [info, cart] = await Promise.all([requireStore(storeSlug), getCart(storeSlug)]);
  return (
    <div className="store-theme flex min-h-screen flex-col">
      {info.is_demo && (
        <p role="note" className="bg-fg px-4 py-2 text-center text-xs text-bg">
          Demonstration store: products are fictional and checkout isn&apos;t live.
        </p>
      )}
      <StoreHeader slug={storeSlug} info={info} cartCount={cart.count} />
      <div className="flex-1">{children}</div>
      <footer className="mt-24 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-muted sm:flex-row sm:justify-between">
          <p>© {info.name}</p>
          <p><Link href={`/s/${storeSlug}/track`} className="underline">Track an order</Link> · Storefront by <Link href="/" className="underline">Nexora</Link></p>
        </div>
      </footer>
    </div>
  );
}
