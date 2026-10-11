import { requireStore } from "@/lib/store";
import { ProductListing } from "@/components/store/ProductListing";

export default async function CategoryPage({ params, searchParams }: {
  params: Promise<{ storeSlug: string; category: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeSlug, category } = await params;
  const info = await requireStore(storeSlug);
  return <ProductListing slug={storeSlug} info={info} category={category} sp={await searchParams} basePath={`/s/${storeSlug}/c/${category}`} />;
}
