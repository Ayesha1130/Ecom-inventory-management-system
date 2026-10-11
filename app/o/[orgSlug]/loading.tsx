export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-white/8" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-[14px] bg-white/6" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-[14px] bg-white/6" />
        <div className="h-80 animate-pulse rounded-[14px] bg-white/6" />
      </div>
    </div>
  );
}
