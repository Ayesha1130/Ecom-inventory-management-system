const steps = [
  ["Add your products", "Import or create products with variants, prices and images."],
  ["Stock your locations", "Set quantities per warehouse and a reorder threshold."],
  ["Open the storefront", "Customers buy against live availability, never stale counts."],
  ["Watch it all connect", "Orders, stock and revenue reflect each sale as it happens."],
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <h2 className="font-display text-5xl tracking-tight md:text-6xl">From first product to first order.</h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-4">
          {steps.map(([title, body], i) => (
            <li key={title} className="border-t border-line pt-4">
              <span className="font-mono text-sm text-violet">{i + 1}</span>
              <h3 className="mt-2 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
