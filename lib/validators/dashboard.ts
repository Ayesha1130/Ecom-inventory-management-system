import { z } from "zod";

// The RPC returns jsonb, so it is validated at the boundary instead of trusted.
export const dashboardSchema = z.object({
  revenue_cents: z.number(),
  orders: z.number(),
  active_products: z.number(),
  low_stock_count: z.number(),
  daily: z.array(z.object({ day: z.string(), revenue_cents: z.number(), orders: z.number() })),
  top_products: z.array(z.object({ name: z.string(), units: z.number(), revenue_cents: z.number() })),
  recent_orders: z.array(
    z.object({
      id: z.string(),
      order_number: z.number(),
      customer: z.string().nullable(),
      total_cents: z.number(),
      status: z.string(),
      payment_status: z.string(),
      placed_at: z.string(),
    }),
  ),
  low_stock: z.array(
    z.object({
      sku: z.string(),
      product: z.string(),
      variant: z.string().nullable(),
      available: z.number(),
      threshold: z.number(),
    }),
  ),
});
export type DashboardSummary = z.infer<typeof dashboardSchema>;
