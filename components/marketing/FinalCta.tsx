import Link from "next/link";

export function FinalCta() {
  return (
    <section className="hero-glow border-t border-line px-6 py-28 text-center">
      <h2 className="mx-auto max-w-3xl font-display text-5xl leading-none tracking-tight md:text-7xl">See it run on a real database.</h2>
      <p className="mx-auto mt-5 max-w-xl text-muted">Walk through a seeded store as a read-only visitor, then place a test order on its storefront.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/demo" className="rounded-full bg-violet px-7 py-3 font-medium">Explore Live Demo</Link>
        <Link href="/signup" className="glass rounded-full px-7 py-3">Create a workspace</Link>
      </div>
    </section>
  );
}
