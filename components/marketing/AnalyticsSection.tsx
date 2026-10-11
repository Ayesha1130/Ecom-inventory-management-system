import { FeatureSection } from "./FeatureSection";

const cats = [["Outerwear", 82], ["Bags", 56], ["Accessories", 34]] as const;
const weeks = [[3, 1], [4, 2], [3, 4], [5, 5], [4, 6], [6, 7]] as const;

function AnalyticsPreview() {
  return (
    <div className="panel space-y-5 p-5">
      <div className="grid grid-cols-3 gap-3 text-xs">
        {[["Revenue", "$48,210"], ["Paid orders", "1,284"], ["Avg. order", "$37.55"]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white/4 p-3"><p className="text-muted">{k}</p><p className="mt-1 font-mono text-lg">{v}</p></div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs text-muted">Sales by category</p>
        <ul className="space-y-2.5">
          {cats.map(([name, w]) => (
            <li key={name} className="text-xs"><div className="mb-1 flex justify-between"><span>{name}</span></div>
              <div className="h-1.5 rounded-full bg-white/8"><div className="h-full rounded-full bg-violet" style={{ width: `${w}%` }} /></div></li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs text-muted">New vs returning buyers, by week</p>
        <div className="flex h-20 items-end gap-2" aria-hidden>
          {weeks.map(([n, r], i) => (
            <div key={i} className="flex flex-1 flex-col justify-end overflow-hidden rounded-t">
              <div className="bg-violet" style={{ height: `${r * 9}px` }} /><div className="bg-cyan" style={{ height: `${n * 9}px` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsSection() {
  return (
    <FeatureSection
      id="analytics"
      flip
      title="Numbers you can trust, net of refunds."
      body="Revenue, order value, best sellers and buyer trends come straight from your orders, and refunds are subtracted. One click exports the data to CSV."
      bullets={[
        "Date-range filters on every chart",
        "Sales by category and best-selling products",
        "Inventory turnover, clearly labeled as an estimate",
      ]}
      visual={<AnalyticsPreview />}
    />
  );
}
