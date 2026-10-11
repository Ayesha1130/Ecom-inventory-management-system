"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createWarehouseAction } from "@/app/actions/inventory";
import { warehouseSchema, type WarehouseValues } from "@/lib/validators/inventory";

export function AddWarehouse({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<WarehouseValues>({ resolver: zodResolver(warehouseSchema), defaultValues: { name: "", code: "" } });
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer text-sm">Add a warehouse</summary>
      <form noValidate className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={handleSubmit((v) => start(async () => {
          setError(undefined);
          const r = await createWarehouseAction(slug, v);
          if (r.error) return void setError(r.error);
          toast.success("Warehouse added"); reset(); router.refresh();
        }))}>
        <Field id="wh-name" label="Name" error={errors.name?.message} {...register("name")} />
        <Field id="wh-code" label="Code" hint="e.g. WEST" error={errors.code?.message} {...register("code")} />
        <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
        {error && <p role="alert" className="text-sm text-red-300 sm:col-span-3">{error}</p>}
      </form>
    </details>
  );
}
