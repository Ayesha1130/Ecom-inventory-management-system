import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/store/CheckoutForm";
import { formatMoney } from "@/lib/format";
import { getCart, requireStore } from "@/lib/store";
import { isStripeConfigured } from "@/lib/stripe";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const [info, cart] = await Promise.all([requireStore(storeSlug), getCart(storeSlug)]);
  if (cart.lines.length === 0) redirect(`/s/${storeSlug}/cart`);
  const unavailable = cart.lines.some((l) => l.quantity > l.available);
  const ready = isStripeConfigured() && isAdminConfigured();
  const reason = !ready ? "Payments aren't configured for this deployment." : unavailable ? "Some items in your cart are no longer available in that quantity. Update your cart to continue." : undefined;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="font-display text-5xl tracking-tight">Checkout</h1>
      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_380px]">
        <CheckoutForm slug={storeSlug} disabledReason={reason} />
        <aside className="panel h-fit p-6" aria-labelledby="sum-h">
          <h2 id="sum-h" className="font-display text-2xl">Your order</h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {cart.lines.map((l) => (
              <li key={l.variant_id} className="flex justify-between gap-4 py-3">
                <span>{l.quantity} × {l.product_name}<span className="block text-muted">{[l.size, l.color].filter(Boolean).join(" · ")}</span></span>
                <span className="font-mono">{formatMoney(l.unit_price_cents * l.quantity, info.currency)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 flex justify-between border-t border-line pt-4 font-medium"><dt>Total</dt><dd className="font-mono">{formatMoney(cart.subtotal_cents, info.currency)}</dd></dl>
          <p className="mt-2 text-xs text-muted">No shipping fee or tax is added in this demo.</p>
          {info.is_demo && <p className="mt-4 rounded-lg bg-raised p-3 text-xs">Test mode: pay with card 4242 4242 4242 4242, any future date, any CVC. No real money moves.</p>}
          <Link href={`/s/${storeSlug}/cart`} className="mt-4 inline-block text-sm underline">Edit cart</Link>
        </aside>
      </div>
    </div>
  );
}
