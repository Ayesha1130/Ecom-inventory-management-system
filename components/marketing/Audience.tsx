const groups = [
  ["Direct-to-consumer brands", "Sell your own products online and keep catalog, stock and orders in one place instead of five tools."],
  ["Multi-location sellers", "Track stock per warehouse, move it between locations, and let the storefront fulfill from whichever has it."],
  ["Growing teams", "Give staff, managers and admins exactly the access they need, and see who changed what."],
];

export function Audience() {
  return (
    <section id="audience" className="mx-auto max-w-7xl px-6 py-24">
      <h2 className="font-display text-5xl tracking-tight md:text-6xl">Built for businesses that ship real things.</h2>
      <ul className="mt-12 grid gap-8 md:grid-cols-3">
        {groups.map(([title, body]) => (
          <li key={title} className="border-t border-line pt-4">
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1.5 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
