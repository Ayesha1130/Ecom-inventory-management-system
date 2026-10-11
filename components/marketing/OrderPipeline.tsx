"use client";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-media";

const steps = [
  { name: "Placed", note: "2 units reserved at Main" },
  { name: "Paid", note: "Payment confirmed, reservation held" },
  { name: "Packed", note: "Picked from Main" },
  { name: "Shipped", note: "Stock committed, customer notified" },
];

export function OrderPipeline() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reduced) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % steps.length), 2200);
    return () => window.clearInterval(id);
  }, [visible, reduced]);

  return (
    <div ref={ref} className="panel p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-sm">Order #1042</p>
        <p className="font-mono text-sm">$128.00</p>
      </div>
      <p className="mt-1 text-xs text-muted">Linen Overshirt (M) x 2</p>
      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => {
          const state = i < active ? "done" : i === active ? "current" : "todo";
          return (
            <li key={s.name} className="flex gap-4" aria-current={state === "current" ? "step" : undefined}>
              <span
                aria-hidden
                className={`mt-0.5 size-3 shrink-0 rounded-full border transition-colors duration-300 ${
                  state === "todo" ? "border-line bg-transparent" : "border-violet bg-violet"
                }`}
              />
              <div className={state === "todo" ? "opacity-40" : ""}>
                <p className="text-sm">{s.name}</p>
                <p className="text-xs text-muted">{s.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
