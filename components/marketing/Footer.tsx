import Link from "next/link";

const cols: [string, [string, string][]][] = [
  ["Product", [["Catalog", "/#catalog"], ["Inventory", "/#inventory"], ["Orders", "/#orders"], ["Storefront", "/#storefront"], ["Analytics", "/#analytics"]]],
  ["Try it", [["Live demo", "/demo"], ["Demo storefront", "/s/alder-finch"], ["Sign in", "/login"], ["Create a workspace", "/signup"]]],
  ["More", [["How it works", "/#how-it-works"], ["Pricing (illustrative)", "/#pricing"], ["FAQ", "/#faq"]]],
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="font-display text-2xl">Nexora</p>
          <p className="mt-3 max-w-xs text-sm text-muted">The modern commerce operating system: a portfolio project. All data shown is simulated.</p>
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <p className="text-sm font-medium">{title}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              {links.map(([label, href]) => <li key={label}><Link href={href} className="transition-colors hover:text-fg">{label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line px-6 py-5 text-center text-xs text-muted">
        Nexora Commerce is a demonstration, not a commercial service. Checkout uses Stripe test mode only.
      </div>
    </footer>
  );
}
