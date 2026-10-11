import { z } from "zod";

const uuid = z.string().uuid();
const money = z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 12.50.");

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email.").max(254)]),
  phone: z.string().trim().max(40),
  notes: z.string().trim().max(2000),
});
export type SupplierValues = z.infer<typeof supplierSchema>;
export const noteSchema = z.object({ body: z.string().trim().min(1, "Write a note.").max(2000, "Notes are limited to 2000 characters.") });

export const poLineSchema = z.object({
  variantId: uuid.or(z.literal("").transform(() => "")).refine((v) => v !== "", "Choose a product."),
  quantity: z.string().trim().regex(/^[1-9]\d{0,5}$/, "Whole number, 1 or more."),
  unitCost: money,
});
export const poFormSchema = z.object({
  supplierId: uuid.or(z.literal("")).refine((v) => v !== "", "Choose a supplier."),
  expectedAt: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a valid date."),
  notes: z.string().trim().max(500),
  lines: z.array(poLineSchema).min(1, "Add at least one line.").max(100),
}).superRefine((p, ctx) => {
  const seen = new Set<string>();
  p.lines.forEach((l, i) => {
    if (seen.has(l.variantId)) ctx.addIssue({ code: "custom", path: ["lines", i, "variantId"], message: "Already on this order." });
    seen.add(l.variantId);
  });
});
export type PoFormValues = z.infer<typeof poFormSchema>;
export const receiveSchema = z.object({
  warehouseId: uuid,
  lines: z.array(z.object({ itemId: uuid, quantity: z.number().int().min(1).max(100000) })).min(1).max(100),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  role: z.enum(["staff", "manager", "admin"]),
});
export type InviteValues = z.infer<typeof inviteSchema>;
export const roleSchema = z.enum(["staff", "manager", "admin", "owner"]);

// ---- RPC result schemas ----
export const customerListSchema = z.object({
  total: z.number(), segments: z.record(z.string(), z.number()),
  rows: z.array(z.object({
    id: z.string(), full_name: z.string(), email: z.string(), created_at: z.string(),
    orders: z.number(), spent_cents: z.number(), last_order_at: z.string().nullable(), segment: z.string(),
  })),
});
export const customerDetailSchema = z.object({
  customer: z.object({ id: z.string(), full_name: z.string(), email: z.string(), created_at: z.string() }),
  orders: z.number(), spent_cents: z.number(), segment: z.string(),
  recent_orders: z.array(z.object({
    id: z.string(), order_number: z.number(), placed_at: z.string(), status: z.string(), payment_status: z.string(),
    fulfillment_status: z.string(), total_cents: z.number(), currency: z.string(),
  })),
  notes: z.array(z.object({ id: z.string(), body: z.string(), created_at: z.string(), author: z.string().nullable() })),
});
export const poListSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.string(), po_number: z.number(), status: z.string(), expected_at: z.string().nullable(), created_at: z.string(),
    supplier_name: z.string(), item_count: z.number(), units_ordered: z.number(), units_received: z.number(), total_cost_cents: z.number(),
  })),
});
export const poDetailSchema = z.object({
  po: z.object({
    id: z.string(), po_number: z.number(), status: z.string(), expected_at: z.string().nullable(), notes: z.string().nullable(),
    created_at: z.string(), ordered_at: z.string().nullable(), received_at: z.string().nullable(),
  }),
  supplier: z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), phone: z.string().nullable() }).nullable(),
  items: z.array(z.object({
    id: z.string(), variant_id: z.string(), sku: z.string(), product: z.string(), variant: z.string().nullable(),
    qty_ordered: z.number(), qty_received: z.number(), unit_cost_cents: z.number(),
  })),
});
export const analyticsSchema = z.object({
  revenue_cents: z.number(), orders: z.number(), aov_cents: z.number(), units: z.number(), cogs_cents: z.number(),
  inventory_value_cents: z.number(), turnover: z.number().nullable(), days_of_inventory: z.number().nullable(),
  daily: z.array(z.object({ day: z.string(), revenue_cents: z.number(), orders: z.number() })),
  by_category: z.array(z.object({ name: z.string(), revenue_cents: z.number(), units: z.number() })),
  best_sellers: z.array(z.object({ name: z.string(), units: z.number(), revenue_cents: z.number() })),
  weekly_customers: z.array(z.object({ week: z.string(), new_customers: z.number(), returning_customers: z.number() })),
});
export const memberListSchema = z.array(z.object({
  user_id: z.string(), role: z.enum(["staff", "manager", "admin", "owner"]), full_name: z.string().nullable(),
  email: z.string().nullable(), joined_at: z.string(), is_you: z.boolean(),
}));
export const auditSchema = z.object({
  total: z.number(),
  rows: z.array(z.object({
    id: z.number(), action: z.string(), entity_type: z.string(), created_at: z.string(),
    actor: z.string().nullable(), metadata: z.record(z.string(), z.unknown()),
  })),
});
export const invitationPreviewSchema = z.object({ organization: z.string(), role: z.string(), email: z.string() });
