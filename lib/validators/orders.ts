import { z } from "zod";

const address = z.object({
  line1: z.string().optional(), line2: z.string().nullish(), city: z.string().optional(),
  region: z.string().nullish(), postal_code: z.string().optional(), country: z.string().optional(),
}).passthrough();
const lines = z.array(z.object({ name: z.string(), variant: z.string().nullable(), quantity: z.number(), unit_price_cents: z.number() }));

export const publicOrderSchema = z.object({
  order_number: z.number(), status: z.string(), payment_status: z.string(), fulfillment_status: z.string(),
  placed_at: z.string(), total_cents: z.number(), refunded_cents: z.number(), currency: z.string(),
  tracking_number: z.string().nullable(), customer_name: z.string().nullable(), customer_email: z.string().nullable(),
  shipping_address: address.nullable(), store_name: z.string(), store_slug: z.string(), lines,
});
export const createdOrderSchema = publicOrderSchema.extend({ order_id: z.string() });
export type PublicOrder = z.infer<typeof publicOrderSchema>;

export const orderListSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.string(), order_number: z.number(), placed_at: z.string(),
    customer_name: z.string().nullable(), customer_email: z.string().nullable(),
    status: z.string(), payment_status: z.string(), fulfillment_status: z.string(),
    total_cents: z.number(), currency: z.string(), item_count: z.number(),
  })),
});

export const orderDetailSchema = z.object({
  order: z.object({
    id: z.string(), order_number: z.number(), status: z.string(), payment_status: z.string(), fulfillment_status: z.string(),
    subtotal_cents: z.number(), total_cents: z.number(), refunded_cents: z.number(), currency: z.string(),
    placed_at: z.string(), paid_at: z.string().nullable(), shipped_at: z.string().nullable(), delivered_at: z.string().nullable(),
    cancelled_at: z.string().nullable(), cancel_reason: z.string().nullable(), tracking_number: z.string().nullable(),
    customer_name: z.string().nullable(), customer_email: z.string().nullable(), shipping_address: address.nullable(),
  }),
  customer: z.object({ full_name: z.string(), email: z.string() }).passthrough().nullable(),
  items: z.array(z.object({ product_name: z.string(), sku: z.string(), variant_label: z.string().nullable(), quantity: z.number(), unit_price_cents: z.number() }).passthrough()),
  events: z.array(z.object({ type: z.string(), message: z.string(), created_at: z.string() })),
  payments: z.array(z.object({ stripe_payment_intent: z.string().nullable(), amount_cents: z.number(), currency: z.string(), created_at: z.string() })),
  refunds: z.array(z.object({ amount_cents: z.number(), reason: z.string().nullable(), restocked: z.boolean(), created_at: z.string() })),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

export const refundFormSchema = z.object({
  amount: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 12.50."),
  restock: z.boolean(),
  reason: z.string().trim().max(200),
});
export type RefundFormValues = z.infer<typeof refundFormSchema>;
export const fulfillSchema = z.object({ to: z.enum(["shipped", "delivered"]), tracking: z.string().trim().max(100) });
