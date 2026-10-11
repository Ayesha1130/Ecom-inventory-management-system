"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelPurchaseOrderAction, placePurchaseOrderAction, receivePurchaseOrderAction } from "@/app/actions/purchasing";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select";

type Item = { id: string; product: string; variant: string | null; sku: string; qty_ordered: number; qty_received: number };

export function PoActions({ slug, poId, status, items, warehouses }: {
  slug: string; poId: string; status: string; items: Item[]; warehouses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(i.qty_ordered - i.qty_received)])));
  const [error, setError] = useState<string>();

  const run = (fn: () => Promise<{ error?: string }>, ok: string) => start(async () => {
    setError(undefined);
    const r = await fn();
    if (r.error) { setError(r.error); toast.error(r.error); return; }
    toast.success(ok); setConfirmCancel(false); router.refresh();
  });
  const lines = items.map((i) => ({ itemId: i.id, quantity: Number(qty[i.id] ?? 0), max: i.qty_ordered - i.qty_received })).filter((l) => l.quantity > 0);
  const invalid = lines.some((l) => !Number.isInteger(l.quantity) || l.quantity > l.max);
  const receivable = status === "ordered" || status === "partially_received";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && <Button disabled={pending} onClick={() => run(() => placePurchaseOrderAction(slug, poId), "Purchase order placed")}>Place order</Button>}
        {(status === "draft" || status === "ordered") && <Button variant="ghost" className="text-red-300" onClick={() => setConfirmCancel(true)}>Cancel order</Button>}
      </div>

      {receivable && (
        <section className="panel space-y-4 p-5" aria-labelledby="recv-h">
          <h2 id="recv-h" className="font-medium">Receive stock</h2>
          <div className="max-w-xs">
            <SelectField id="wh" label="Into warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </SelectField>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Quantities to receive</caption>
            <thead className="text-xs text-muted"><tr><th className="pb-2 font-normal">Item</th><th className="pb-2 text-right font-normal">Outstanding</th><th className="pb-2 text-right font-normal">Receive now</th></tr></thead>
            <tbody>
              {items.filter((i) => i.qty_ordered > i.qty_received).map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-2">{i.product}{i.variant ? <span className="text-muted"> · {i.variant}</span> : null}<p className="font-mono text-xs text-muted">{i.sku}</p></td>
                  <td className="py-2 text-right font-mono">{i.qty_ordered - i.qty_received}</td>
                  <td className="py-2 text-right">
                    <label className="sr-only" htmlFor={`recv-${i.id}`}>Quantity to receive for {i.sku}</label>
                    <input id={`recv-${i.id}`} inputMode="numeric" value={qty[i.id] ?? ""} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value.replace(/\D/g, "") })}
                      className="w-24 rounded-lg border border-line bg-raised px-2 py-1.5 text-right font-mono text-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {invalid && <p role="alert" className="text-sm text-red-300">You can&apos;t receive more than is outstanding.</p>}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button disabled={pending || invalid || lines.length === 0 || !warehouseId}
            onClick={() => run(() => receivePurchaseOrderAction(slug, poId, { warehouseId, lines: lines.map(({ itemId, quantity }) => ({ itemId, quantity })) }), "Stock received")}>
            {pending ? "Receiving…" : "Receive stock"}
          </Button>
          <p className="text-xs text-muted">Adds the units to that warehouse, logs them in stock history, and updates each item&apos;s average unit cost.</p>
        </section>
      )}

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this purchase order?">
        <p className="text-sm text-muted">No stock has been received against it, so nothing else changes.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep it</Button>
          <Button className="bg-red-500 hover:bg-red-500/90" disabled={pending} onClick={() => run(() => cancelPurchaseOrderAction(slug, poId), "Purchase order cancelled")}>Cancel order</Button>
        </div>
      </Modal>
    </div>
  );
}
