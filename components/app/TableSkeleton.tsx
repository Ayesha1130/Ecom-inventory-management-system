export function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy="true" aria-label={label}>
      <div className="h-10 w-56 animate-pulse rounded-lg bg-white/8" />
      <div className="h-12 animate-pulse rounded-[14px] bg-white/6" />
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />)}
    </div>
  );
}
