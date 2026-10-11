"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import { adjustStockAction, setThresholdAction, transferStockAction } from "@/app/actions/inventory";
import {
  adjustSchema, thresholdSchema, transferSchema,
  type AdjustValues, type ThresholdValues, type TransferValues,
} from "@/lib/validators/inventory";

export type Warehouse = { id: string; name: string; code: string };
type Common = { slug: string; variantId: string; warehouses: Warehouse[]; onDone: () => void };

function useSubmit(onDone: () => void, success: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const submit = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r.error) return void setError(r.error);
      toast.success(success);
      router.refresh();
      onDone();
    });
  return { pending, error, submit };
}

export function AdjustForm({ slug, variantId, warehouses, onDone }: Common) {
  const { pending, error, submit } = useSubmit(onDone, "Stock updated");
  const { register, handleSubmit, control, formState: { errors } } = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { variantId, warehouseId: warehouses[0]?.id ?? "", reason: "restock", direction: "increase", quantity: "", note: "" },
  });
  const reason = useWatch({ control, name: "reason" });
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => submit(() => adjustStockAction(slug, v)))}>
      <SelectField id="adj-wh" label="Warehouse" error={errors.warehouseId?.message} {...register("warehouseId")}>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </SelectField>
      <SelectField id="adj-reason" label="Reason" {...register("reason")}>
        <option value="restock">Restock (add)</option>
        <option value="return">Customer return (add)</option>
        <option value="damage">Damaged or lost (remove)</option>
        <option value="adjustment">Count correction</option>
      </SelectField>
      {reason === "adjustment" && (
        <SelectField id="adj-dir" label="Correction" {...register("direction")}>
          <option value="increase">Add units</option><option value="decrease">Remove units</option>
        </SelectField>
      )}
      <Field id="adj-qty" label="Units" inputMode="numeric" error={errors.quantity?.message} {...register("quantity")} />
      <Field id="adj-note" label="Note (optional)" error={errors.note?.message} {...register("note")} />
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Update stock"}</Button>
    </form>
  );
}

export function TransferForm({ slug, variantId, warehouses, onDone }: Common) {
  const { pending, error, submit } = useSubmit(onDone, "Transfer complete");
  const { register, handleSubmit, formState: { errors } } = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { variantId, fromId: warehouses[0]?.id ?? "", toId: warehouses[1]?.id ?? "", quantity: "", note: "" },
  });
  if (warehouses.length < 2) return <p className="text-sm text-muted">Add a second warehouse to transfer stock between locations.</p>;
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => submit(() => transferStockAction(slug, v)))}>
      <SelectField id="tr-from" label="From" error={errors.fromId?.message} {...register("fromId")}>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </SelectField>
      <SelectField id="tr-to" label="To" error={errors.toId?.message} {...register("toId")}>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </SelectField>
      <Field id="tr-qty" label="Units" inputMode="numeric" error={errors.quantity?.message} {...register("quantity")} />
      <Field id="tr-note" label="Note (optional)" error={errors.note?.message} {...register("note")} />
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Transferring…" : "Transfer stock"}</Button>
    </form>
  );
}

export function ThresholdForm({ slug, variantId, current, onDone }: { slug: string; variantId: string; current: number; onDone: () => void }) {
  const { pending, error, submit } = useSubmit(onDone, "Reorder point saved");
  const { register, handleSubmit, formState: { errors } } = useForm<ThresholdValues>({
    resolver: zodResolver(thresholdSchema), defaultValues: { variantId, threshold: String(current) },
  });
  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit((v) => submit(() => setThresholdAction(slug, v)))}>
      <Field id="thr" label="Alert when available stock is at or below" inputMode="numeric" error={errors.threshold?.message} {...register("threshold")} />
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save reorder point"}</Button>
    </form>
  );
}
