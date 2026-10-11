"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { bulkStatusAction, deleteProductsAction } from "@/app/actions/products";
import { formatMoney } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import type { ProductList } from "@/lib/validators/catalog";

const tone = { active: "bg-cyan/15 text-cyan", draft: "bg-white/10 text-muted", archived: "bg-white/5 text-muted" } as const;

export function ProductTable({ rows, slug, canWrite, currency }: {
  rows: ProductList["rows"]; slug: string; canWrite: boolean; currency: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const ids = [...selected];
  const allChecked = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const run = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setConfirmDelete(false);
      if (r.error) return void toast.error(r.error);
      toast.success(ok);
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div>
      {canWrite && selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-violet/40 bg-violet/10 px-4 py-2.5 text-sm">
          <span className="mr-2">{selected.size} selected</span>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => bulkStatusAction(slug, ids, "active"), "Products activated")}>Activate</Button>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => bulkStatusAction(slug, ids, "archived"), "Products archived")}>Archive</Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirmDelete(true)} className="text-red-300">Delete</Button>
        </div>
      )}
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Products</caption>
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              {canWrite && (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Select all products on this page" checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} />
                </th>
              )}
              <th className="px-4 py-3 font-normal">Product</th>
              <th className="px-4 py-3 font-normal">Status</th>
              <th className="px-4 py-3 text-right font-normal">Available</th>
              <th className="px-4 py-3 text-right font-normal">Price</th>
              <th className="px-4 py-3 font-normal">Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                {canWrite && (
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link href={`/o/${slug}/products/${r.id}`} className="flex items-center gap-3 hover:underline">
                    {r.image_path ? (
                      <Image src={publicImageUrl(r.image_path)} alt="" width={40} height={40} className="size-10 rounded-lg object-cover" />
                    ) : (
                      <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-white/6 font-display text-lg text-muted">{r.name[0]}</span>
                    )}
                    <span><span className="block">{r.name}</span><span className="text-xs text-muted">{r.variants} variant{r.variants === 1 ? "" : "s"}</span></span>
                  </Link>
                </td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${tone[r.status]}`}>{r.status}</span></td>
                <td className="px-4 py-3 text-right font-mono">
                  {r.available === 0 && r.status === "active" ? <span className="text-warn">Out of stock</span> : r.available}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {r.min_price == null ? "—" : r.min_price === r.max_price ? formatMoney(r.min_price, currency) : `${formatMoney(r.min_price, currency)} – ${formatMoney(r.max_price ?? 0, currency)}`}
                </td>
                <td className="px-4 py-3 text-muted">{r.category ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${selected.size} product${selected.size === 1 ? "" : "s"}?`}>
        <p className="text-sm text-muted">This permanently removes the products, their variants and images. Products with stock history can&apos;t be deleted; archive those instead.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button disabled={pending} className="bg-red-500 hover:bg-red-500/90" onClick={() => run(() => deleteProductsAction(slug, ids), "Products deleted")}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
