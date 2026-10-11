"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const SEEN_KEY = "nexora-tour-v1";
const listeners = new Set<() => void>();

function readSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; } // storage blocked: don't auto-open
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => { listeners.delete(onChange); window.removeEventListener("storage", onChange); };
}

export function tourSteps(slug: string, storeSlug: string) {
  return [
    { title: "Your command center", body: "The overview shows revenue, orders, active products and low-stock alerts for any date range, with change against the previous period.", href: `/o/${slug}`, cta: "Open the dashboard" },
    { title: "Orders, end to end", body: "Every order has a timeline. Paid orders move to shipped and delivered, unpaid ones expire and release their stock, and refunds are tracked.", href: `/o/${slug}/orders`, cta: "See the orders" },
    { title: "Inventory you can trust", body: "Stock is tracked per warehouse as on hand, reserved and available, with a full movement history. Nothing changes without a ledger entry.", href: `/o/${slug}/inventory`, cta: "Open inventory" },
    { title: "A storefront on the same data", body: "Shoppers see live prices and availability. Add something to the cart; checkout runs in Stripe test mode, so no real money ever moves.", href: `/s/${storeSlug}`, cta: "Visit the storefront" },
    { title: "Analytics and your team", body: "Revenue net of refunds, best sellers and new-versus-returning buyers, plus roles, invitations and an append-only audit log.", href: `/o/${slug}/analytics`, cta: "View analytics" },
  ];
}

export function DemoTour({ slug, storeSlug }: { slug: string; storeSlug: string }) {
  const steps = tourSteps(slug, storeSlug);
  const [manual, setManual] = useState(false);
  const [i, setI] = useState(0);
  // server snapshot is "seen" so nothing renders open during SSR; first-time visitors get it on the client
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const open = manual || !seen;

  const close = () => { setManual(false); markSeen(); };
  const step = steps[i]!;
  const last = i === steps.length - 1;

  return (
    <>
      <button type="button" onClick={() => { setI(0); setManual(true); }} className="underline">Take the 2-minute tour</button>
      <Modal open={open} onClose={close} title={step.title}>
        <p className="text-xs text-muted" aria-live="polite">Step {i + 1} of {steps.length}</p>
        <p className="mt-2 text-sm">{step.body}</p>
        <Link href={step.href} onClick={close} className="mt-4 inline-block text-sm text-cyan underline">{step.cta} →</Link>
        <div className="mt-6 flex justify-between gap-2">
          <Button variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Back</Button>
          {last ? <Button onClick={close}>Done</Button> : <Button onClick={() => setI(i + 1)}>Next</Button>}
        </div>
      </Modal>
    </>
  );
}
