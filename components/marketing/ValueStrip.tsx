const points = [
  ["Stock never drifts", "Every sale, return and transfer writes to one ledger, so counts match reality."],
  ["Overselling is blocked", "Stock is reserved at checkout and checked in the database, not the browser."],
  ["Each business is isolated", "Teams, products and customers stay inside their own organization."],
];

export function ValueStrip() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-3">
        {points.map(([title, body]) => (
          <div key={title}>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
