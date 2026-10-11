import { z } from "zod";

export const storeInfoSchema = z.object({
  name: z.string(), tagline: z.string().nullable(), currency: z.string(), is_demo: z.boolean(),
  categories: z.array(z.object({ slug: z.string(), name: z.string(), count: z.number() })),
});
export const listingSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.string(), slug: z.string(), name: z.string(),
    category_slug: z.string().nullable(), category: z.string().nullable(),
    min_price: z.number().nullable(), max_price: z.number().nullable(),
    on_sale: z.boolean(), colors: z.array(z.string()), in_stock: z.boolean(), image_path: z.string().nullable(),
  })),
});
export const productSchema = z.object({
  name: z.string(), slug: z.string(), description: z.string().nullable(),
  category: z.string().nullable(), category_slug: z.string().nullable(),
  images: z.array(z.object({ path: z.string(), alt: z.string() })),
  variants: z.array(z.object({
    id: z.string(), size: z.string().nullable(), color: z.string().nullable(),
    price_cents: z.number(), sale_price_cents: z.number().nullable(), available: z.number(),
  })),
});
export const cartSchema = z.object({
  lines: z.array(z.object({
    variant_id: z.string(), product_name: z.string(), product_slug: z.string(),
    size: z.string().nullable(), color: z.string().nullable(),
    unit_price_cents: z.number(), list_price_cents: z.number(),
    quantity: z.number(), available: z.number(), image_path: z.string().nullable(),
  })),
  subtotal_cents: z.number(), count: z.number(),
});
export type StoreInfo = z.infer<typeof storeInfoSchema>;
export type Listing = z.infer<typeof listingSchema>;
export type StoreProduct = z.infer<typeof productSchema>;
export type Cart = z.infer<typeof cartSchema>;
export const EMPTY_CART: Cart = { lines: [], subtotal_cents: 0, count: 0 };
