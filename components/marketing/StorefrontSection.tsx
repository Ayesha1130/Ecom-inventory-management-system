import { ProductArt } from "@/components/store/ProductArt";
import { FeatureSection } from "./FeatureSection";

const items = [
  { name: "Linen Overshirt", price: "$96.00", was: "$128.00", color: "Sand" },
  { name: "Ridge Canvas Tote", price: "$64.00", was: "", color: "Ink" },
  { name: "Harbor Wool Beanie", price: "$32.00", was: "", color: "Rust" },
];

function StorefrontPreview() {
  return (
    <div className="store-theme rounded-[14px] border border-line p-5">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <span className="font-display text-xl">Alder &amp; Finch</span>
        <span className="text-xs">Cart · 2</span>
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-3" aria-label="Sample products">
        {items.map((p) => (
          <li key={p.name}>
            <ProductArt name={p.name} color={p.color} className="aspect-[4/5] rounded-lg [&_span]:text-5xl" />
            <p className="mt-2 text-xs leading-snug">{p.name}</p>
            <p className="font-mono text-xs">{p.price}{p.was && <s className="ml-1.5 text-muted">{p.was}</s>}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StorefrontSection() {
  return (
    <FeatureSection
      id="storefront"
      title="A storefront that sells what you actually have."
      body="Your catalog publishes to a fast, mobile-first store that reads live prices and stock. Shoppers pick a size and color, see real availability, and check out with Stripe."
      bullets={[
        "Variant picker with live availability, never stale counts",
        "Guest cart held in a secure cookie, no account needed",
        "Order tracking with just an order number and email",
      ]}
      visual={<StorefrontPreview />}
    />
  );
}
