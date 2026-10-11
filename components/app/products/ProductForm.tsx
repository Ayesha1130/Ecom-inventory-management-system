"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { saveProductAction } from "@/app/actions/products";
import { productFormSchema, type ProductFormValues } from "@/lib/validators/product";
import { slugify } from "@/lib/slug";

export const emptyVariant = { variantId: "", sku: "", option_size: "", option_color: "", price: "", sale_price: "", cost: "", low_stock_threshold: "5" };

export function ProductForm({ slug, productId, defaults, categories, canWrite }: {
  slug: string; productId: string | null; defaults: ProductFormValues; categories: { id: string; name: string }[]; canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string>();
  const { register, control, handleSubmit, setValue, formState: { errors, dirtyFields } } =
    useForm<ProductFormValues>({ resolver: zodResolver(productFormSchema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: "variants" });
  const name = register("name");

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={handleSubmit((values) => start(async () => {
        setFormError(undefined);
        const r = await saveProductAction(slug, productId, values);
        if (r?.error) { setFormError(r.error); toast.error(r.error); return; }
        toast.success("Product saved");
        router.refresh();
      }))}
    >
      <fieldset disabled={!canWrite || pending} className="space-y-8 disabled:opacity-80">
        <section className="panel grid gap-4 p-5 md:grid-cols-2">
          <Field id="name" label="Name" error={errors.name?.message} {...name}
            onChange={(e) => { void name.onChange(e); if (!productId && !dirtyFields.slug) setValue("slug", slugify(e.target.value)); }} />
          <Field id="slug" label="URL handle" hint="Used in storefront links." error={errors.slug?.message} {...register("slug")} />
          <div className="md:col-span-2">
            <label htmlFor="description" className="mb-1.5 block text-sm">Description</label>
            <textarea id="description" rows={4} {...register("description")}
              className="w-full rounded-lg border border-line bg-raised px-3.5 py-2.5 text-sm outline-none focus:border-violet" />
          </div>
          <SelectField id="status" label="Status" {...register("status")}>
            <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
          </SelectField>
          <SelectField id="category_id" label="Category" error={errors.category_id?.message} {...register("category_id")}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <Field id="new_category" label="Or create a category" placeholder="e.g. Outerwear" error={errors.new_category?.message} {...register("new_category")} />
        </section>

        <section aria-labelledby="variants-h" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="variants-h" className="font-medium">Variants</h2>
            <Button type="button" variant="ghost" onClick={() => append(emptyVariant)}>Add variant</Button>
          </div>
          {(errors.variants?.message || errors.variants?.root?.message) && (
            <p role="alert" className="text-sm text-red-300">{errors.variants?.message ?? errors.variants?.root?.message}</p>
          )}
          {fields.map((f, i) => {
            const e = errors.variants?.[i];
            return (
              <div key={f.id} className="panel grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" {...register(`variants.${i}.variantId`)} />
                <Field id={`sku-${i}`} label="SKU" error={e?.sku?.message} {...register(`variants.${i}.sku`)} />
                <Field id={`size-${i}`} label="Size" error={e?.option_size?.message} {...register(`variants.${i}.option_size`)} />
                <Field id={`color-${i}`} label="Color" error={e?.option_color?.message} {...register(`variants.${i}.option_color`)} />
                <Field id={`thr-${i}`} label="Reorder at" inputMode="numeric" error={e?.low_stock_threshold?.message} {...register(`variants.${i}.low_stock_threshold`)} />
                <Field id={`price-${i}`} label="Price" inputMode="decimal" error={e?.price?.message} {...register(`variants.${i}.price`)} />
                <Field id={`sale-${i}`} label="Sale price" inputMode="decimal" error={e?.sale_price?.message} {...register(`variants.${i}.sale_price`)} />
                <Field id={`cost-${i}`} label="Unit cost" inputMode="decimal" error={e?.cost?.message} {...register(`variants.${i}.cost`)} />
                <div className="flex items-end">
                  <Button type="button" variant="ghost" disabled={fields.length === 1} onClick={() => remove(i)} aria-label={`Remove variant ${i + 1}`}>Remove</Button>
                </div>
              </div>
            );
          })}
        </section>
      </fieldset>

      {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
      {canWrite ? (
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : productId ? "Save changes" : "Create product"}</Button>
      ) : (
        <p className="text-sm text-muted">You have view-only access to this product.</p>
      )}
    </form>
  );
}
