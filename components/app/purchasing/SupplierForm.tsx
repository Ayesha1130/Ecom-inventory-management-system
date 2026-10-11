"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createSupplierAction, setSupplierActiveAction } from "@/app/actions/crm";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { supplierSchema, type SupplierValues } from "@/lib/validators/ops";

export function SupplierForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupplierValues>({ resolver: zodResolver(supplierSchema), defaultValues: { name: "", email: "", phone: "", notes: "" } });
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer text-sm">Add a supplier</summary>
      <form noValidate className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit((v) => start(async () => {
        setError(undefined);
        const r = await createSupplierAction(slug, v);
        if (r.error) return void setError(r.error);
        toast.success("Supplier added"); reset(); router.refresh();
      }))}>
        <Field id="s-name" label="Name" error={errors.name?.message} {...register("name")} />
        <Field id="s-email" label="Email" type="email" error={errors.email?.message} {...register("email")} />
        <Field id="s-phone" label="Phone" error={errors.phone?.message} {...register("phone")} />
        <Field id="s-notes" label="Notes" error={errors.notes?.message} {...register("notes")} />
        {error && <p role="alert" className="text-sm text-red-300 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add supplier"}</Button></div>
      </form>
    </details>
  );
}

export function SupplierToggle({ slug, id, active }: { slug: string; id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="text-sm text-muted underline hover:text-fg"
      onClick={() => start(async () => {
        const r = await setSupplierActiveAction(slug, id, !active);
        if (r.error) return void toast.error(r.error);
        router.refresh();
      })}>{active ? "Deactivate" : "Reactivate"}</button>
  );
}
