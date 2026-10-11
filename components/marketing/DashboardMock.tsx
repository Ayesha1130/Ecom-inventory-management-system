const bars = [38, 52, 44, 63, 58, 76, 70, 88];

export function DashboardMock() {
  return (
    <div className="glass w-[520px] max-w-full p-5 text-left" aria-hidden>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Revenue, last 30 days</span>
        <span className="rounded bg-white/5 px-2 py-0.5">Demo data</span>
      </div>
      <p className="mt-2 font-mono text-3xl">$48,210</p>
      <div className="mt-4 flex h-24 items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}%` }}
            className="flex-1 rounded-t bg-linear-to-t from-indigo to-violet"
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        {[
          ["Orders", "1,284"],
          ["Low stock", "7"],
          ["Active SKUs", "312"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white/4 p-3">
            <p className="text-muted">{k}</p>
            <p className="mt-1 font-mono text-lg">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
