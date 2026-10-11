import { z } from "zod";
import { toCents } from "@/lib/money";

const money = z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 12.50.");
const optionalMoney = z.string().trim().regex(/^(\d{1,7}(\.\d{1,2})?)?$/, "Enter an amount like 12.50.");
const wholeNumber = z.string().trim().regex(/^\d{1,6}$/, "Enter a whole number.");

export const variantFormSchema = z
  .object({
    variantId: z.string(),
    sku: z.string().trim().min(1, "Required.").max(64, "Too long."),
    option_size: z.string().trim().max(40),
    option_color: z.string().trim().max(40),
    price: money,
    sale_price: optionalMoney,
    cost: optionalMoney,
    low_stock_threshold: wholeNumber,
  })
  .refine((v) => !v.sale_price || toCents(v.sale_price) < toCents(v.price), {
    path: ["sale_price"],
    message: "Must be lower than the price.",
  });

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name.").max(160),
    slug: z.string().trim().toLowerCase().min(1, "Enter a URL.").max(80)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and single hyphens only."),
    description: z.string().max(5000),
    status: z.enum(["draft", "active", "archived"]),
    category_id: z.union([z.literal(""), z.string().uuid()]),
    new_category: z.string().trim().max(80),
    variants: z.array(variantFormSchema).min(1, "Add at least one variant.").max(100),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    p.variants.forEach((v, i) => {
      const key = v.sku.toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "Duplicate SKU." });
      seen.add(key);
    });
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

export function toRpcPayload(v: ProductFormValues, categoryId: string) {
  return {
    name: v.name,
    slug: v.slug,
    description: v.description,
    status: v.status,
    category_id: categoryId,
    variants: v.variants.map((x) => ({
      id: x.variantId,
      sku: x.sku,
      option_size: x.option_size,
      option_color: x.option_color,
      price_cents: toCents(x.price),
      sale_price_cents: x.sale_price ? toCents(x.sale_price) : null,
      cost_cents: x.cost ? toCents(x.cost) : 0,
      low_stock_threshold: Number(x.low_stock_threshold),
    })),
  };
}

export const idsSchema = z.array(z.string().uuid()).min(1).max(100);
