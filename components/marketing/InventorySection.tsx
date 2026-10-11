import { FeatureSection } from "./FeatureSection";

const stock = [
  { item: "Linen Overshirt, M", main: 4, east: 22, reserved: 2, low: true },
  { item: "Ridge Canvas Tote, Sand", main: 58, east: 31, reserved: 6, low: false },
  { item: "Harbor Wool Beanie, Ink", main: 12, east: 0, reserved: 1, low: false },
  { item: "Field Trail Sock, L", main: 140, east: 96, reserved: 11, low: false },
];

function InventoryPreview() {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[460px] text-left text-sm">
        <caption className="sr-only">Sample stock by warehouse</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-3 font-normal">Item</th>
            <th className="px-4 py-3 text-right font-normal">Main</th>
            <th className="px-4 py-3 text-right font-normal">East</th>
            <th className="px-4 py-3 text-right font-normal">Reserved</th>
            <th className="px-4 py-3 font-normal">Alert</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((s) => (
            <tr key={s.item} className="border-b border-line last:border-0">
              <td className="px-4 py-3">{s.item}</td>
              <td className="px-4 py-3 text-right font-mono">{s.main}</td>
              <td className="px-4 py-3 text-right font-mono">{s.east}</td>
              <td className="px-4 py-3 text-right font-mono text-muted">{s.reserved}</td>
              <td className="px-4 py-3">
                {s.low ? (
                  <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn">Reorder</span>
                ) : (
                  <span className="text-xs text-muted">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-line px-4 py-3 text-xs text-muted">
        Transfer 20 units, Main to East: both counts update together or not at all.
      </div>
    </div>
  );
}

export function InventorySection() {
  return (
    <FeatureSection
      id="inventory"
      flip
      title="Know what you can sell, right now."
      body="Available stock is what's on hand minus what's reserved by open orders. Every change is logged, with a reason and a person attached."
      bullets={[
        "Multiple warehouses with transfers between them",
        "Low-stock thresholds that raise alerts",
        "Full movement history for every adjustment",
      ]}
      visual={<InventoryPreview />}
    />
  );
}
