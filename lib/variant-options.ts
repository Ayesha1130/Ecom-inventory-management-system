import type { SupabaseClient } from "@supabase/supabase-js";
import { inventoryListSchema } from "@/lib/validators/catalog";

export type VariantOption = { id: string; label: string; costCents: number };

/** Up to 500 sellable variants for pickers, read through list_inventory so RLS and archiving rules apply. */
export async function loadVariantOptions(supabase: SupabaseClient, orgId: string): Promise<VariantOption[]> {
  const out: VariantOption[] = [];
  for (let page = 0; page < 5; page++) {
    const { data } = await supabase.rpc("list_inventory", { p_org: orgId, p_search: null, p_low_only: false, p_limit: 100, p_offset: page * 100 });
    const parsed = inventoryListSchema.safeParse(data);
    if (!parsed.success) break;
    for (const r of parsed.data.rows) out.push({ id: r.variant_id, label: `${r.product}${r.variant ? ` · ${r.variant}` : ""} (${r.sku})`, costCents: r.cost_cents });
    if (parsed.data.rows.length < 100) break;
  }
  return out;
}
