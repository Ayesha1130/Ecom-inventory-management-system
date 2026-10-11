import { OrderView } from "@/components/store/OrderView";
import { rateLimit } from "@/lib/rate-limit";
import { requireStore } from "@/lib/store";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { publicOrderSchema } from "@/lib/validators/orders";

export const metadata = { title: "Track your order", robots: { index: false, follow: false } };

export default async function TrackPage({ params, searchParams }: {
  params: Promise<{ storeSlug: string }>; searchParams: Promise<{ order?: string; email?: string }>;
}) {
  const { storeSlug } = await params;
  const sp = await searchParams;
  await requireStore(storeSlug);

  const num = Number((sp.order ?? "").replace(/^#/, ""));
  const email = (sp.email ?? "").trim().slice(0, 254);
  const searched = !!sp.order || !!sp.email;
  let order = null;
  const limited = searched ? await rateLimit("track", 20, 600) : ({ ok: true } as const);
  if (searched && limited.ok && Number.isInteger(num) && num > 0 && num < 2_000_000_000 && email.includes("@") && isAdminConfigured()) {
    const { data } = await createAdminClient().rpc("order_lookup", { p_store: storeSlug, p_number: num, p_email: email });
    if (data) order = publicOrderSchema.parse(data);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-5xl tracking-tight">Track your order</h1>
      <form method="get" className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="order" className="mb-1.5 block text-sm">Order number</label>
          <input id="order" name="order" inputMode="numeric" defaultValue={sp.order ?? ""} required className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm" />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm">Email used at checkout</label>
          <input id="email" name="email" type="email" defaultValue={sp.email ?? ""} required className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm" />
        </div>
        <button className="rounded-full bg-violet px-6 py-2.5 text-sm font-medium text-white">Look up</button>
      </form>
      {order ? (
        <div className="mt-10"><OrderView order={order} /></div>
      ) : !limited.ok ? (
        <p role="alert" className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm">{limited.message}</p>
      ) : searched ? (
        <p role="alert" className="mt-8 rounded-lg border border-line bg-surface p-4 text-sm">We couldn&apos;t find an order matching those details. Check the number and email and try again.</p>
      ) : null}
    </div>
  );
}
