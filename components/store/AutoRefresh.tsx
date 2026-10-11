"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Polls the server component for a short time: the payment webhook may land a moment after the redirect. */
export function AutoRefresh({ everyMs = 3000, times = 15 }: { everyMs?: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      router.refresh();
      if (++n >= times) window.clearInterval(id);
    }, everyMs);
    return () => window.clearInterval(id);
  }, [router, everyMs, times]);
  return null;
}
