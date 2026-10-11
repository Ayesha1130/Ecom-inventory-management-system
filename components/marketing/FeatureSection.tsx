import type { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  body: string;
  bullets: string[];
  visual: ReactNode;
  flip?: boolean;
};

export function FeatureSection({ id, title, body, bullets, visual, flip }: Props) {
  return (
    <section id={id} className="mx-auto max-w-7xl px-6 py-24">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className={flip ? "lg:order-2" : ""}>
          <h2 className="font-display text-5xl leading-none tracking-tight md:text-6xl">{title}</h2>
          <p className="mt-5 max-w-lg text-muted">{body}</p>
          <ul className="mt-6 space-y-2 text-sm">
            {bullets.map((b) => (
              <li key={b} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className={flip ? "lg:order-1" : ""}>
          {visual}
          <p className="mt-3 text-xs text-muted">Sample interface with simulated data.</p>
        </div>
      </div>
    </section>
  );
}
