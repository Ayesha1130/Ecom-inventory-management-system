import { z } from "zod";

const qty = z.string().trim().regex(/^[1-9]\d{0,5}$/, "Enter a whole number of at least 1.");

export const adjustSchema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid("Choose a warehouse."),
  reason: z.enum(["restock", "return", "damage", "adjustment"]),
  direction: z.enum(["increase", "decrease"]),
  quantity: qty,
  note: z.string().trim().max(200),
});
export type AdjustValues = z.infer<typeof adjustSchema>;

export function adjustDelta(v: AdjustValues): number {
  const q = Number(v.quantity);
  if (v.reason === "restock" || v.reason === "return") return q;
  if (v.reason === "damage") return -q;
  return v.direction === "increase" ? q : -q;
}

export const transferSchema = z
  .object({
    variantId: z.string().uuid(),
    fromId: z.string().uuid("Choose a warehouse."),
    toId: z.string().uuid("Choose a warehouse."),
    quantity: qty,
    note: z.string().trim().max(200),
  })
  .refine((v) => v.fromId !== v.toId, { path: ["toId"], message: "Choose a different warehouse." });
export type TransferValues = z.infer<typeof transferSchema>;

export const thresholdSchema = z.object({
  variantId: z.string().uuid(),
  threshold: z.string().trim().regex(/^\d{1,6}$/, "Enter a whole number."),
});
export type ThresholdValues = z.infer<typeof thresholdSchema>;

export const warehouseSchema = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(60),
  code: z.string().trim().regex(/^[A-Za-z0-9]{2,12}$/, "2 to 12 letters or numbers."),
});
export type WarehouseValues = z.infer<typeof warehouseSchema>;
