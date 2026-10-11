"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteProductImageAction, uploadProductImageAction } from "@/app/actions/products";
import { publicImageUrl } from "@/lib/storage";

export function ImageManager({ slug, productId, images, canWrite }: {
  slug: string; productId: string; images: { id: string; path: string; alt: string }[]; canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const form = useRef<HTMLFormElement>(null);

  return (
    <section aria-labelledby="images-h" className="panel p-5">
      <h2 id="images-h" className="mb-4 font-medium">Images</h2>
      {images.length === 0 ? (
        <p className="mb-4 text-sm text-muted">No images yet. JPEG, PNG or WebP, up to 5 MB each. The first image is the cover.</p>
      ) : (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="relative">
              <Image src={publicImageUrl(img.path)} alt={img.alt} width={240} height={240} className="aspect-square w-full rounded-lg object-cover" />
              {i === 0 && <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px]">Cover</span>}
              {canWrite && (
                <button type="button" disabled={pending} aria-label="Delete image"
                  onClick={() => start(async () => {
                    const r = await deleteProductImageAction(slug, img.id);
                    if (r.error) return void toast.error(r.error);
                    toast.success("Image removed"); router.refresh();
                  })}
                  className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs hover:bg-black/80">✕</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form ref={form} className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("slug", slug); fd.set("productId", productId);
            start(async () => {
              setError(undefined);
              const r = await uploadProductImageAction(fd);
              if (r.error) { setError(r.error); return; }
              toast.success("Image uploaded"); form.current?.reset(); router.refresh();
            });
          }}>
          <div>
            <label htmlFor="file" className="mb-1.5 block text-sm">Add image</label>
            <input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required className="text-sm" />
          </div>
          <div>
            <label htmlFor="alt" className="mb-1.5 block text-sm">Description (alt text)</label>
            <input id="alt" name="alt" maxLength={200} className="rounded-lg border border-line bg-raised px-3 py-2 text-sm" />
          </div>
          <Button type="submit" variant="ghost" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>
          {error && <p role="alert" className="w-full text-sm text-red-300">{error}</p>}
        </form>
      )}
    </section>
  );
}
