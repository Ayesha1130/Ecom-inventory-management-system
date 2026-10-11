import { requireStore } from "@/lib/store";
import { ProductListing } from "@/components/store/ProductListing";

export const metadata = { title: "All products" };

export default async function AllProducts({ params, searchParams }: {
  params: Promise<{ storeSlug: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeSlug } = await params;
  const info = await requireStore(storeSlug);
  return <ProductListing slug={storeSlug} info={info} sp={await searchParams} basePath={`/s/${storeSlug}/products`} />;
}
