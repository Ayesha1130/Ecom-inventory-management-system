import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { swatchColor } from "@/lib/colors";
import { publicImageUrl } from "@/lib/storage";
import type { Listing } from "@/lib/validators/storefront";
import { ProductArt } from "./ProductArt";

export function ProductCard({ p, slug, currency }: { p: Listing["rows"][number]; slug: string; currency: string }) {
  const price = p.min_price == null ? "" : p.min_price === p.max_price ? formatMoney(p.min_price, currency) : `From ${formatMoney(p.min_price, currency)}`;
  return (
    <li>
      <Link href={`/s/${slug}/p/${p.slug}`} className="group block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-raised">
          {p.image_path ? (
            <Image src={publicImageUrl(p.image_path)} alt="" fill sizes="(min-width:1024px) 25vw, 50vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          ) : (
            <ProductArt name={p.name} color={p.colors[0]} className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
          )}
          {!p.in_stock ? (
            <span className="absolute left-3 top-3 rounded-full bg-surface px-2.5 py-1 text-xs">Sold out</span>
          ) : p.on_sale ? (
            <span className="absolute left-3 top-3 rounded-full bg-violet px-2.5 py-1 text-xs text-white">Sale</span>
          ) : null}
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] leading-snug group-hover:underline">{p.name}</h3>
            <div className="mt-1.5 flex gap-1" aria-label={`Colors: ${p.colors.join(", ")}`}>
              {p.colors.slice(0, 5).map((c) => (
                <span key={c} title={c} className="size-3 rounded-full border border-line" style={{ background: swatchColor(c) }} />
              ))}
            </div>
          </div>
          <p className="shrink-0 font-mono text-sm">{price}</p>
        </div>
      </Link>
    </li>
  );
}
