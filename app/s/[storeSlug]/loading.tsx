export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10" aria-busy="true" aria-label="Loading">
      <div className="h-12 w-64 animate-pulse rounded-lg bg-raised" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-raised" />)}
      </div>
    </div>
  );
}
