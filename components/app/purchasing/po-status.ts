import type { Tone } from "@/components/app/Pill";

export const poTone: Record<string, Tone> = { draft: "muted", ordered: "violet", partially_received: "warn", received: "good", cancelled: "muted" };
export const poLabel: Record<string, string> = { draft: "Draft", ordered: "Ordered", partially_received: "Partly received", received: "Received", cancelled: "Cancelled" };
