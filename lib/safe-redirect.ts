/** Only allow same-site relative paths, to prevent open redirects via ?next=. */
export function safeNext(next: string | null | undefined, fallback = "/onboarding"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
