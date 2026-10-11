import Link from "next/link";
import { getCart, requireStore } from "@/lib/store";
import { CartLines } from "@/components/store/CartLines";
import { isStripeConfigured } from "@/lib/stripe";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const metadata = { title: "Your cart" };

export default async function CartPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const [info, cart] = await Promise.all([requireStore(storeSlug), getCart(storeSlug)]);
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="font-display text-5xl tracking-tight">Your cart</h1>
      {cart.lines.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-display text-3xl">Your cart is empty.</p>
          <Link href={`/s/${storeSlug}/products`} className="mt-6 inline-block rounded-full bg-violet px-7 py-3 text-sm font-medium text-white">Start shopping</Link>
        </div>
      ) : (
        <div className="mt-8"><CartLines slug={storeSlug} cart={cart} currency={info.currency} checkoutEnabled={isStripeConfigured() && isAdminConfigured()} /></div>
      )}
    </div>
  );
}
