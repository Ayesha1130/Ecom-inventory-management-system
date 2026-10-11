"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { updateStoreAction } from "@/app/actions/store";
import { storeSettingsSchema, type StoreSettingsValues } from "@/lib/validators/store";

export function StorefrontForm({ slug, defaults, canEdit }: { slug: string; defaults: StoreSettingsValues; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState: { errors } } = useForm<StoreSettingsValues>({ resolver: zodResolver(storeSettingsSchema), defaultValues: defaults });

  return (
    <form noValidate className="panel space-y-4 p-5"
      onSubmit={handleSubmit((v) => start(async () => {
        setError(undefined);
        const r = await updateStoreAction(slug, v);
        if (r.error) return void setError(r.error);
        toast.success("Storefront updated"); router.refresh();
      }))}>
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <Field id="store-name" label="Store name" error={errors.name?.message} {...register("name")} />
        <Field id="store-tagline" label="Homepage headline" hint="Shown large on your storefront homepage." error={errors.tagline?.message} {...register("tagline")} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" {...register("is_published")} />
          <span>Published<span className="block text-xs text-muted">When off, the storefront returns &ldquo;not found&rdquo; to the public.</span></span>
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {canEdit ? <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button> : <p className="text-sm text-muted">Only admins can change these settings.</p>}
    </form>
  );
}
