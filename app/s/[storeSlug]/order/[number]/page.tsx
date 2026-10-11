import { notFound } from "next/navigation";
import Link from "next/link";
import { AutoRefresh } from "@/components/store/AutoRefresh";
import { OrderView } from "@/components/store/OrderView";
import { TOKEN_RE, requireStore } from "@/lib/store";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { publicOrderSchema } from "@/lib/validators/orders";

// The URL carries a secret token: keep it out of Referer headers and search indexes.
export const metadata = { title: "Your order", referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ storeSlug: string; number: string }>; searchParams: Promise<{ t?: string }>;
}) {
  const { storeSlug, number } = await params;
  const { t } = await searchParams;
  await requireStore(storeSlug);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1 || n > 2_000_000_000 || !t || !TOKEN_RE.test(t) || !isAdminConfigured()) notFound();

  const { data, error } = await createAdminClient().rpc("order_by_token", { p_store: storeSlug, p_number: n, p_token: t });
  if (error) throw new Error("Couldn't load your order.");
  if (!data) notFound();
  const order = publicOrderSchema.parse(data);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      {order.status === "pending" && <AutoRefresh />}
      <OrderView order={order} />
      <p className="mt-8 text-sm text-muted">
        Questions? Look up this order anytime on the <Link href={`/s/${storeSlug}/track`} className="underline">tracking page</Link> with your order number and email.
      </p>
    </div>
  );
}
