const faqs = [
  ["Is Nexora a real product?", "No. It's a portfolio project that shows how a modern commerce back office can be built. Every product, order and number in the demo is simulated."],
  ["Does the demo take real payments?", "No. Checkout runs in Stripe's test mode, where only test card numbers work and no real money moves."],
  ["How is each business's data kept separate?", "Every table is scoped to an organization and protected by database-level row security, so a query can only return rows the signed-in person is allowed to see."],
  ["Can two shoppers buy the last item?", "No. Stock is reserved in the same database transaction that creates the order, and the database refuses to let reserved stock exceed what's on hand."],
  ["What if a payment notification arrives twice?", "Each Stripe event is recorded in the same transaction as its effect, so a repeat delivery does nothing. If processing fails, nothing is recorded and Stripe's retry succeeds."],
  ["What can the demo visitor change?", "Nothing. The demo is an anonymous, read-only session. Sign up to create your own workspace and try every action."],
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
      <h2 className="font-display text-5xl tracking-tight md:text-6xl">Questions, answered.</h2>
      <div className="mt-10 divide-y divide-line border-y border-line">
        {faqs.map(([q, a]) => (
          <details key={q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {q}<span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
