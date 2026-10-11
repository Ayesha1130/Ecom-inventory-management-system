import { SelectField } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export const SORTS = {
  newest: ["created", "desc"], oldest: ["created", "asc"],
  name_asc: ["name", "asc"], name_desc: ["name", "desc"],
  price_asc: ["price", "asc"], price_desc: ["price", "desc"],
  stock_asc: ["stock", "asc"], stock_desc: ["stock", "desc"],
} as const;
export type SortKey = keyof typeof SORTS;
const labels: Record<SortKey, string> = {
  newest: "Newest", oldest: "Oldest", name_asc: "Name A–Z", name_desc: "Name Z–A",
  price_asc: "Price, low to high", price_desc: "Price, high to low", stock_asc: "Stock, low to high", stock_desc: "Stock, high to low",
};

// A plain GET form: filters live in the URL, so they work without JavaScript and can be shared.
export function ProductFilters({ q, status, category, sort, categories }: {
  q: string; status: string; category: string; sort: SortKey; categories: { id: string; name: string }[];
}) {
  return (
    <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
      <Field id="q" name="q" label="Search" placeholder="Name or SKU" defaultValue={q} />
      <SelectField id="status" name="status" label="Status" defaultValue={status}>
        <option value="">All</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
      </SelectField>
      <SelectField id="category" name="category" label="Category" defaultValue={category}>
        <option value="">All</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <SelectField id="sort" name="sort" label="Sort by" defaultValue={sort}>
        {(Object.keys(SORTS) as SortKey[]).map((k) => <option key={k} value={k}>{labels[k]}</option>)}
      </SelectField>
      <Button type="submit" variant="ghost">Apply</Button>
    </form>
  );
}
