import { FeatureSection } from "./FeatureSection";

const rows = [
  { name: "Linen Overshirt", sku: "LIN-OVR", variants: "4 sizes, 3 colors", price: "$128.00", sale: "$96.00", status: "Active" },
  { name: "Ridge Canvas Tote", sku: "RDG-TOT", variants: "2 colors", price: "$64.00", sale: "", status: "Active" },
  { name: "Harbor Wool Beanie", sku: "HRB-BNI", variants: "5 colors", price: "$32.00", sale: "", status: "Draft" },
  { name: "Field Trail Sock", sku: "FLD-SCK", variants: "3 sizes", price: "$18.00", sale: "", status: "Archived" },
];

const tone: Record<string, string> = {
  Active: "bg-cyan/15 text-cyan",
  Draft: "bg-white/10 text-muted",
  Archived: "bg-white/5 text-muted",
};

function CatalogPreview() {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[460px] text-left text-sm">
        <caption className="sr-only">Sample product catalog</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-3 font-normal">Product</th>
            <th className="px-4 py-3 font-normal">Variants</th>
            <th className="px-4 py-3 text-right font-normal">Price</th>
            <th className="px-4 py-3 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku} className="border-b border-line last:border-0">
              <td className="px-4 py-3">
                <p>{r.name}</p>
                <p className="font-mono text-xs text-muted">{r.sku}</p>
              </td>
              <td className="px-4 py-3 text-muted">{r.variants}</td>
              <td className="px-4 py-3 text-right font-mono">
                {r.sale ? (
                  <>
                    {r.sale} <s className="text-muted">{r.price}</s>
                  </>
                ) : (
                  r.price
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs ${tone[r.status]}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CatalogSection() {
  return (
    <FeatureSection
      id="catalog"
      title="One catalog behind every channel."
      body="Create a product once and it powers your admin, your storefront and your orders. Variants, SKUs, sale prices and images live together."
      bullets={[
        "Variants by size and color, each with its own SKU",
        "Sale prices and status: active, draft, archived",
        "Bulk edit, search, filter and sort",
      ]}
      visual={<CatalogPreview />}
    />
  );
}
