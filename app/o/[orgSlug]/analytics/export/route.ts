import { requireOrgAccess } from "@/lib/authz";
import { toCsv } from "@/lib/csv";
import { RANGES, type RangeKey } from "@/components/app/RangeTabs";
import { inventoryListSchema } from "@/lib/validators/catalog";

export const runtime = "nodejs";
const DAY = 86_400_000;
const money = (cents: number) => (cents / 100).toFixed(2);
const MAX_ORDER_ROWS = 10_000;

export async function GET(req: Request, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const range = (url.searchParams.get("range") ?? "30d") as RangeKey;
  if ((type !== "orders" && type !== "inventory") || !(range in RANGES)) return new Response("Bad request", { status: 400 });

  // Same access rules as the page: RLS decides what rows come back, so exports can't exceed what the user may read.
  const { supabase, org } = await requireOrgAccess(orgSlug);
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${org.slug}-${type}-${type === "orders" ? range + "-" : ""}${stamp}.csv"`,
    "Cache-Control": "no-store",
  };

  if (type === "orders") {
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY);
    const start = new Date(end.getTime() - RANGES[range] * DAY);
    const { data, error } = await supabase.from("orders")
      .select("order_number, placed_at, status, payment_status, fulfillment_status, customer_name, customer_email, subtotal_cents, total_cents, refunded_cents, currency")
      .eq("organization_id", org.id).gte("placed_at", start.toISOString()).lt("placed_at", end.toISOString())
      .order("placed_at", { ascending: false }).limit(MAX_ORDER_ROWS);
    if (error) return new Response("Export failed", { status: 500 });
    const rows = (data ?? []).map((o) => ({
      order_number: o.order_number, placed_at: o.placed_at, status: o.status, payment_status: o.payment_status, fulfillment_status: o.fulfillment_status,
      customer_name: o.customer_name, customer_email: o.customer_email, subtotal: money(o.subtotal_cents), total: money(o.total_cents),
      refunded: money(o.refunded_cents), currency: o.currency,
    }));
    const cols = (["order_number", "placed_at", "status", "payment_status", "fulfillment_status", "customer_name", "customer_email", "subtotal", "total", "refunded", "currency"] as const)
      .map((key) => ({ key, header: key }));
    return new Response(toCsv(rows, cols), { headers });
  }

  const out: Record<string, string | number>[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase.rpc("list_inventory", { p_org: org.id, p_search: null, p_low_only: false, p_limit: 100, p_offset: page * 100 });
    if (error) return new Response("Export failed", { status: 500 });
    const parsed = inventoryListSchema.parse(data);
    for (const r of parsed.rows) {
      out.push({ sku: r.sku, product: r.product, variant: r.variant ?? "", on_hand: r.on_hand, reserved: r.reserved, available: r.available,
        reorder_point: r.threshold, unit_cost: money(r.cost_cents), stock_value: money(r.on_hand * r.cost_cents) });
    }
    if (parsed.rows.length < 100) break;
  }
  const cols = (["sku", "product", "variant", "on_hand", "reserved", "available", "reorder_point", "unit_cost", "stock_value"] as const).map((key) => ({ key, header: key }));
  return new Response(toCsv(out, cols), { headers });
}
