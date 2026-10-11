"use client";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createPurchaseOrderAction } from "@/app/actions/purchasing";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { fromCents, toCents } from "@/lib/money";
import { poFormSchema, type PoFormValues } from "@/lib/validators/ops";
import type { VariantOption } from "@/lib/variant-options";

export function PurchaseOrderForm({ slug, suppliers, options, currency }: {
  slug: string; suppliers: { id: string; name: string }[]; options: VariantOption[]; currency: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const { register, control, handleSubmit, setValue, getValues, formState: { errors } } = useForm<PoFormValues>({
    resolver: zodResolver(poFormSchema),
    defaultValues: { supplierId: "", expectedAt: "", notes: "", lines: [{ variantId: "", quantity: "", unitCost: "" }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" });
  const total = lines.reduce((s, l) => s + (/^[1-9]\d*$/.test(l.quantity) && /^\d+(\.\d{1,2})?$/.test(l.unitCost) ? Number(l.quantity) * toCents(l.unitCost) : 0), 0);

  const submit = (place: boolean) => handleSubmit((v) => start(async () => {
    setError(undefined);
    const r = await createPurchaseOrderAction(slug, v, place); // redirects to the new order on success
    if (r?.error) { setError(r.error); toast.error(r.error); }
  }))();

  return (
    <form noValidate className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset disabled={pending} className="space-y-6">
        <section className="panel grid gap-4 p-5 md:grid-cols-3">
          <SelectField id="supplier" label="Supplier" error={errors.supplierId?.message} {...register("supplierId")}>
            <option value="">Choose…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          <Field id="expected" label="Expected on" type="date" error={errors.expectedAt?.message} {...register("expectedAt")} />
          <Field id="po-notes" label="Notes (optional)" error={errors.notes?.message} {...register("notes")} />
        </section>

        <section aria-labelledby="lines-h" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="lines-h" className="font-medium">Lines</h2>
            <Button type="button" variant="ghost" onClick={() => append({ variantId: "", quantity: "", unitCost: "" })}>Add line</Button>
          </div>
          {errors.lines?.message && <p role="alert" className="text-sm text-red-300">{errors.lines.message}</p>}
          {fields.map((f, i) => {
            const e = errors.lines?.[i];
            const variant = register(`lines.${i}.variantId`);
            return (
              <div key={f.id} className="panel grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
                <SelectField id={`v-${i}`} label="Product" error={e?.variantId?.message} {...variant}
                  onChange={(ev) => {
                    void variant.onChange(ev);
                    const opt = options.find((o) => o.id === ev.target.value);
                    if (opt && !getValues(`lines.${i}.unitCost`)) setValue(`lines.${i}.unitCost`, fromCents(opt.costCents));
                  }}>
                  <option value="">Choose…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </SelectField>
                <Field id={`q-${i}`} label="Quantity" inputMode="numeric" error={e?.quantity?.message} {...register(`lines.${i}.quantity`)} />
                <Field id={`c-${i}`} label="Unit cost" inputMode="decimal" error={e?.unitCost?.message} {...register(`lines.${i}.unitCost`)} />
                <Button type="button" variant="ghost" disabled={fields.length === 1} onClick={() => remove(i)} aria-label={`Remove line ${i + 1}`}>Remove</Button>
              </div>
            );
          })}
          <p className="text-right text-sm">Total <span className="ml-2 font-mono text-lg">{formatMoney(total, currency)}</span></p>
        </section>
      </fieldset>

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="ghost" disabled={pending} onClick={() => submit(false)}>Save as draft</Button>
        <Button type="button" disabled={pending} onClick={() => submit(true)}>{pending ? "Saving…" : "Place order"}</Button>
      </div>
      <p className="text-xs text-muted">A draft can be edited by placing a new one; placing an order lets you receive stock against it.</p>
    </form>
  );
}
