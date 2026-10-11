"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { addToCartAction } from "@/app/actions/cart";
import { swatchColor } from "@/lib/colors";
import { formatMoney } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import type { StoreProduct } from "@/lib/validators/storefront";
import { ProductArt } from "./ProductArt";

const uniq = <T,>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];

export function ProductPurchase({ slug, product, currency }: { slug: string; product: StoreProduct; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { variants, images } = product;
  const first = variants.find((v) => v.available > 0) ?? variants[0]!;
  const [size, setSize] = useState(first.size);
  const [color, setColor] = useState(first.color);
  const [qty, setQty] = useState(1);
  const [shot, setShot] = useState(0);

  const sizes = useMemo(() => uniq(variants.map((v) => v.size)), [variants]);
  const colors = useMemo(() => uniq(variants.map((v) => v.color)), [variants]);
  const selected = variants.find((v) => v.size === size && v.color === color) ?? first;
  const price = selected.sale_price_cents ?? selected.price_cents;
  const max = Math.max(1, Math.min(selected.available, 10));

  // Picking one option moves the other to the nearest existing combination, so an invalid pair is impossible.
  const pick = (next: { size?: string | null; color?: string | null }) => {
    const want = { size: next.size !== undefined ? next.size : size, color: next.color !== undefined ? next.color : color };
    const pool = variants.filter((v) => (next.size !== undefined ? v.size === want.size : v.color === want.color));
    const best = pool.find((v) => v.size === want.size && v.color === want.color) ?? pool.find((v) => v.available > 0) ?? pool[0];
    if (best) { setSize(best.size); setColor(best.color); setQty(1); }
  };
  const inStock = (test: (v: (typeof variants)[number]) => boolean) => variants.some((v) => test(v) && v.available > 0);

  const status = selected.available === 0 ? "Out of stock" : selected.available <= 5 ? `Only ${selected.available} left` : "In stock";
  const chip = "rounded-full border px-4 py-2 text-sm transition-colors";

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-raised">
          {images.length ? (
            <Image src={publicImageUrl(images[shot]!.path)} alt={images[shot]!.alt || product.name} fill priority sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
          ) : (
            <ProductArt name={product.name} color={color} className="size-full" />
          )}
        </div>
        {images.length > 1 && (
          <ul className="mt-3 flex gap-2">
            {images.map((img, i) => (
              <li key={img.path}>
                <button type="button" onClick={() => setShot(i)} aria-label={`Show image ${i + 1}`} aria-current={i === shot}
                  className={`relative size-16 overflow-hidden rounded-lg border ${i === shot ? "border-fg" : "border-line"}`}>
                  <Image src={publicImageUrl(img.path)} alt="" fill sizes="64px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h1 className="font-display text-5xl leading-none tracking-tight">{product.name}</h1>
        <p className="mt-4 font-mono text-xl">
          {formatMoney(price, currency)}
          {selected.sale_price_cents != null && <s className="ml-3 text-base text-muted">{formatMoney(selected.price_cents, currency)}</s>}
        </p>
        {product.description && <p className="mt-5 max-w-prose whitespace-pre-line text-muted">{product.description}</p>}

        {sizes.length > 0 && (
          <fieldset className="mt-8">
            <legend className="mb-2 text-sm">Size</legend>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button key={s} type="button" aria-pressed={s === size} onClick={() => pick({ size: s })}
                  className={`${chip} ${s === size ? "border-fg bg-fg text-bg" : "border-line hover:bg-fg/5"} ${!inStock((v) => v.size === s) ? "line-through opacity-60" : ""}`}>{s}</button>
              ))}
            </div>
          </fieldset>
        )}
        {colors.length > 0 && (
          <fieldset className="mt-6">
            <legend className="mb-2 text-sm">Color: <span className="text-muted">{color}</span></legend>
            <div className="flex flex-wrap gap-3">
              {colors.map((c) => (
                <button key={c} type="button" aria-pressed={c === color} aria-label={c} title={c} onClick={() => pick({ color: c })}
                  className={`size-9 rounded-full border-2 p-0.5 ${c === color ? "border-fg" : "border-transparent"} ${!inStock((v) => v.color === c) ? "opacity-40" : ""}`}>
                  <span className="block size-full rounded-full border border-line" style={{ background: swatchColor(c) }} />
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <p role="status" className={`mt-6 text-sm ${selected.available === 0 ? "text-red-700" : selected.available <= 5 ? "text-[#9a5b00]" : "text-muted"}`}>{status}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-line" role="group" aria-label="Quantity">
            <button type="button" className="px-4 py-2" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
            <span className="w-8 text-center font-mono text-sm" aria-live="polite">{qty}</span>
            <button type="button" className="px-4 py-2" aria-label="Increase quantity" disabled={qty >= max} onClick={() => setQty(qty + 1)}>+</button>
          </div>
          <button type="button" disabled={pending || selected.available === 0}
            className="flex-1 rounded-full bg-violet px-6 py-3 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => start(async () => {
              const r = await addToCartAction(slug, selected.id, qty);
              if (r.error) return void toast.error(r.error);
              toast.success("Added to your cart", { action: { label: "View cart", onClick: () => router.push(`/s/${slug}/cart`) } });
              router.refresh();
            })}>
            {pending ? "Adding…" : selected.available === 0 ? "Out of stock" : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
