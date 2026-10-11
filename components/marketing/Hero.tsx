"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardMock } from "./DashboardMock";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

function useEnable3D() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if (reduce || !wide) return;
    const id = window.setTimeout(() => setOn(true), 250);
    return () => window.clearTimeout(id);
  }, []);
  return on;
}

export function Hero() {
  const enable3D = useEnable3D();
  return (
    <section className="hero-glow relative overflow-hidden px-6 pb-24 pt-16 lg:pt-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        <div>
          <h1 className="font-display text-[clamp(3rem,7vw,6.5rem)] leading-[0.95] tracking-[-0.03em]">
            One Platform. Every Order. <em className="text-violet">Total Control.</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Manage your products, inventory, orders, customers, and revenue from one beautifully
            connected commerce workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className="rounded-full bg-violet px-6 py-3 font-medium">
              Explore Live Demo
            </Link>
            <a href="#how-it-works" className="glass rounded-full px-6 py-3">
              See How It Works
            </a>
          </div>
          <p className="mt-4 text-xs text-muted">Portfolio demo product. All figures shown are simulated.</p>
        </div>
        <div className="relative h-[520px]">
          {enable3D ? (
            <HeroScene />
          ) : (
            <div className="flex h-full items-center justify-center [perspective:1200px]">
              <div className="[transform:rotateY(-14deg)_rotateX(6deg)]">
                <DashboardMock />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
