import { createHash } from "node:crypto";

type HeaderReader = { get(name: string): string | null };

/**
 * Derives an opaque rate-limit key from the caller's address. Only the first X-Forwarded-For hop is used, which is
 * correct behind a proxy that overwrites the header (Vercel does). Behind anything else the header is spoofable, so
 * keep the app behind such a proxy. The address is hashed so no raw IPs are stored.
 */
export function clientKey(h: HeaderReader): string {
  const raw = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  const ip = /^[0-9a-fA-F:.]{3,45}$/.test(raw) ? raw.toLowerCase() : "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
