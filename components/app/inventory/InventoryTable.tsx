"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/format";
import type { InventoryList } from "@/lib/validators/catalog";
import { AdjustForm, ThresholdForm, TransferForm, type Warehouse } from "./StockForms";

type Row = InventoryList["rows"][number];
type Tab = "adjust" | "transfer" | "reorder";
const tabs: [Tab, string][] = [["adjust", "Adjust"], ["transfer", "Transfer"], ["reorder", "Reorder point"]];

export function InventoryTable({ rows, warehouses, slug, canWrite, currency }: {
  rows: Row[]; warehouses: Warehouse[]; slug: string; canWrite: boolean; currency: string;
}) {
  const [active, setActive] = useState<{ row: Row; tab: Tab } | null>(null);
  const close = () => setActive(null);

  return (
    <>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <caption className="sr-only">Inventory by variant</caption>
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-normal">Item</th>
              <th className="px-4 py-3 font-normal">By location</th>
              <th className="px-4 py-3 text-right font-normal">On hand</th>
              <th className="px-4 py-3 text-right font-normal">Reserved</th>
              <th className="px-4 py-3 text-right font-normal">Available</th>
              <th className="px-4 py-3 text-right font-normal">Value</th>
              {canWrite && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const low = r.available <= r.threshold;
              return (
                <tr key={r.variant_id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <p>{r.product}{r.variant ? <span className="text-muted"> · {r.variant}</span> : null}</p>
                    <p className="font-mono text-xs text-muted">{r.sku}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {warehouses.map((w) => (
                        <span key={w.id} className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-xs" title={w.name}>
                          {w.code} {r.by_warehouse[w.id]?.on_hand ?? 0}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.on_hand}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">{r.reserved}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono ${low ? "text-warn" : ""}`}>{r.available}</span>
                    {low && <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn">{r.available === 0 ? "Out" : "Low"}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(r.on_hand * r.cost_cents, currency)}</td>
                  {canWrite && (
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" className="px-3 py-1.5" onClick={() => setActive({ row: r, tab: "adjust" })}
                        aria-label={`Manage stock for ${r.product} ${r.variant ?? ""}`}>Manage</Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!active} onClose={close} title={active ? `${active.row.product}${active.row.variant ? ` · ${active.row.variant}` : ""}` : ""}>
        {active && (
          <div className="space-y-5">
            <div role="group" aria-label="Stock action" className="flex rounded-full border border-line p-1 text-sm">
              {tabs.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={active.tab === key}
                  onClick={() => setActive({ ...active, tab: key })}
                  className={`flex-1 rounded-full px-3 py-1.5 ${active.tab === key ? "bg-white/10" : "text-muted hover:text-fg"}`}>{label}</button>
              ))}
            </div>
            {active.tab === "adjust" && <AdjustForm key="a" slug={slug} variantId={active.row.variant_id} warehouses={warehouses} onDone={close} />}
            {active.tab === "transfer" && <TransferForm key="t" slug={slug} variantId={active.row.variant_id} warehouses={warehouses} onDone={close} />}
            {active.tab === "reorder" && <ThresholdForm key="r" slug={slug} variantId={active.row.variant_id} current={active.row.threshold} onDone={close} />}
          </div>
        )}
      </Modal>
    </>
  );
}
