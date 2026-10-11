import { FeatureSection } from "./FeatureSection";
import { OrderPipeline } from "./OrderPipeline";

export function OrdersSection() {
  return (
    <FeatureSection
      id="orders"
      title="Orders that move stock on their own."
      body="Each status change updates inventory in the same database transaction. Cancel an order and its reserved stock goes straight back on the shelf."
      bullets={[
        "Payment, fulfillment and refund status tracked separately",
        "A timeline of every change on every order",
        "Duplicate payment webhooks are ignored safely",
      ]}
      visual={<OrderPipeline />}
    />
  );
}
