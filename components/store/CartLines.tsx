"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setCartQtyAction } from "@/app/actions/cart";
import { formatMoney } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import type { Cart } from "@/lib/validators/storefront";
import { ProductArt } from "./ProductArt";

export function CartLines({ slug, cart, currency, checkoutEnabled }: { slug: string; cart: Cart; currency: string; checkoutEnabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (variantId: string, qty: number) =>
    start(async () => {
      const r = await setCartQtyAction(slug, variantId, qty);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  const blocked = cart.lines.some((l) => l.quantity > l.available);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <ul className="divide-y divide-line border-y border-line" aria-busy={pending}>
        {cart.lines.map((l) => {
          const over = l.quantity > l.available;
          return (
            <li key={l.variant_id} className="flex gap-4 py-5">
              <Link href={`/s/${slug}/p/${l.product_slug}`} className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-raised">
                {l.image_path ? <Image src={publicImageUrl(l.image_path)} alt="" fill sizes="96px" className="object-cover" /> : <ProductArt name={l.product_name} color={l.color} className="size-full [&_span]:text-4xl" />}
              </Link>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex justify-between gap-4">
                  <div>
                    <Link href={`/s/${slug}/p/${l.product_slug}`} className="hover:underline">{l.product_name}</Link>
                    <p className="text-sm text-muted">{[l.size, l.color].filter(Boolean).join(" · ")}</p>
                    {over && <p role="alert" className="mt-1 text-sm text-red-700">{l.available === 0 ? "No longer in stock." : `Only ${l.available} available.`}</p>}
                  </div>
                  <p className="font-mono text-sm">{formatMoney(l.unit_price_cents * l.quantity, currency)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center rounded-full border border-line text-sm" role="group" aria-label={`Quantity for ${l.product_name}`}>
                    <button type="button" className="px-3 py-1.5" aria-label="Decrease quantity" disabled={pending} onClick={() => set(l.variant_id, l.quantity - 1)}>−</button>
                    <span className="w-7 text-center font-mono">{l.quantity}</span>
                    <button type="button" className="px-3 py-1.5" aria-label="Increase quantity" disabled={pending || l.quantity >= l.available} onClick={() => set(l.variant_id, l.quantity + 1)}>+</button>
                  </div>
                  <button type="button" className="text-sm text-muted underline" disabled={pending} onClick={() => set(l.variant_id, 0)}>Remove</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="panel h-fit p-6">
        <h2 className="font-display text-2xl">Summary</h2>
        <dl className="mt-4 flex justify-between text-sm"><dt>Subtotal</dt><dd className="font-mono">{formatMoney(cart.subtotal_cents, currency)}</dd></dl>
        <p className="mt-2 text-xs text-muted">Shipping and taxes are added at checkout.</p>
        {checkoutEnabled && !blocked ? (
          <Link href={`/s/${slug}/checkout`} className="mt-6 block w-full rounded-full bg-violet px-6 py-3 text-center text-sm font-medium text-white">Checkout</Link>
        ) : (
          <>
            <button type="button" disabled className="mt-6 w-full cursor-not-allowed rounded-full bg-violet px-6 py-3 text-sm font-medium text-white opacity-50">Checkout</button>
            <p className="mt-3 text-xs text-muted">
              {blocked ? "Adjust the highlighted items to continue." : "Payments aren't configured for this deployment."}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
