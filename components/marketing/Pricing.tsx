"use client";
import Link from "next/link";
import { useState } from "react";

type Cycle = "monthly" | "annual";
const ANNUAL_DISCOUNT = 0.2;
const plans = [
  { name: "Starter", monthly: 0, blurb: "Everything you need to open a store.", features: ["One workspace and storefront", "Products, variants and images", "Inventory in one warehouse"] },
  { name: "Growth", monthly: 29, blurb: "For teams running day-to-day operations.", features: ["Multiple warehouses and transfers", "Suppliers and purchase orders", "Team roles and an audit log"], featured: true },
  { name: "Scale", monthly: 99, blurb: "For larger catalogs and busier teams.", features: ["Everything in Growth", "Analytics and CSV exports", "Priority support"] },
] as const;

export const priceFor = (monthly: number, cycle: Cycle) =>
  cycle === "monthly" ? monthly : Math.round(monthly * (1 - ANNUAL_DISCOUNT) * 100) / 100;

export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  return (
    <section id="pricing" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <h2 className="font-display text-5xl tracking-tight md:text-6xl">Simple, illustrative pricing.</h2>
        <p role="note" className="mt-4 max-w-2xl rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          Nexora is a portfolio project, so there is nothing to buy. These plans show how pricing could look; no billing is connected and no limits are enforced.
        </p>
        <div role="group" aria-label="Billing period" className="mt-8 inline-flex rounded-full border border-line p-1 text-sm">
          {(["monthly", "annual"] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cycle === c} onClick={() => setCycle(c)}
              className={`rounded-full px-4 py-1.5 capitalize ${cycle === c ? "bg-white/10" : "text-muted hover:text-fg"}`}>
              {c}{c === "annual" && <span className="ml-1.5 text-xs text-cyan">save 20%</span>}
            </button>
          ))}
        </div>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {plans.map((p) => {
            const price = priceFor(p.monthly, cycle);
            return (
              <li key={p.name} className={`panel flex flex-col p-6 ${"featured" in p && p.featured ? "border-violet/60" : ""}`}>
                <h3 className="font-medium">{p.name}</h3>
                <p className="mt-4 font-mono text-4xl" aria-label={`${price} dollars per month`}>
                  ${Number.isInteger(price) ? price : price.toFixed(2)}<span className="text-sm text-muted"> / mo</span>
                </p>
                {p.monthly > 0 && cycle === "annual" && <p className="mt-1 text-xs text-muted">Billed annually (illustrative)</p>}
                <p className="mt-3 text-sm text-muted">{p.blurb}</p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-cyan">✓</span>{f}</li>)}
                </ul>
                <Link href="/demo" className="mt-6 rounded-full border border-line px-5 py-2.5 text-center text-sm hover:bg-white/6">Explore the demo</Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
