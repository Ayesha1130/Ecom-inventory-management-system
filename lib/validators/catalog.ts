import { z } from "zod";

export const productListSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.string(), name: z.string(), slug: z.string(),
    status: z.enum(["draft", "active", "archived"]),
    created_at: z.string(), category: z.string().nullable(),
    variants: z.number(), min_price: z.number().nullable(), max_price: z.number().nullable(),
    available: z.number(), image_path: z.string().nullable(),
  })),
});

export const inventoryListSchema = z.object({
  total: z.number(),
  summary: z.object({ units: z.number(), valuation_cents: z.number(), low_count: z.number() }),
  rows: z.array(z.object({
    variant_id: z.string(), sku: z.string(), product: z.string(), status: z.string(),
    variant: z.string().nullable(), cost_cents: z.number(), threshold: z.number(),
    on_hand: z.number(), reserved: z.number(), available: z.number(),
    by_warehouse: z.record(z.string(), z.object({ on_hand: z.number(), reserved: z.number() })),
  })),
});

export const movementsSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.number(), delta: z.number(), reason: z.string(), note: z.string().nullable(),
    created_at: z.string(), sku: z.string(), product: z.string(), warehouse: z.string(), actor: z.string().nullable(),
  })),
});
export type ProductList = z.infer<typeof productListSchema>;
export type InventoryList = z.infer<typeof inventoryListSchema>;
