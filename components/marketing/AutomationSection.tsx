import { FeatureSection } from "./FeatureSection";

const alerts = [
  { tone: "bg-warn", title: "Low stock: Linen Overshirt", body: "LIN-OVR-M has 4 available (reorder point 5)", time: "2 min ago" },
  { tone: "bg-violet", title: "New order #1042", body: "128.00 USD paid by a customer", time: "9 min ago" },
  { tone: "bg-warn", title: "Out of stock: Harbor Wool Beanie", body: "HRB-BNI-INK has 0 available (reorder point 5)", time: "1 hr ago" },
];

function AutomationPreview() {
  return (
    <ul className="panel divide-y divide-line" aria-label="Sample notifications">
      {alerts.map((a) => (
        <li key={a.title} className="flex items-start gap-3 px-5 py-4">
          <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${a.tone}`} />
          <span className="min-w-0 flex-1 text-sm"><span className="block">{a.title}</span><span className="block text-xs text-muted">{a.body}</span></span>
          <span className="shrink-0 text-xs text-muted">{a.time}</span>
        </li>
      ))}
    </ul>
  );
}

export function AutomationSection() {
  return (
    <FeatureSection
      id="alerts"
      title="Hear about problems before customers do."
      body="Set a reorder point per product. When available stock reaches it, you get one alert, not a flood, and a new paid order lands in your inbox the moment it clears."
      bullets={[
        "Alerts judge the final state of a change, so a stock transfer never cries wolf",
        "Reorder from the supplier and receive stock back into a warehouse",
        "Every important action is recorded in an append-only audit log",
      ]}
      visual={<AutomationPreview />}
    />
  );
}
