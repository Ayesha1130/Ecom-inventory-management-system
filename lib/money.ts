/** "12.5" -> 1250. String math on purpose: no floating point near money. */
export function toCents(amount: string): number {
  const [dollars = "0", cents = ""] = amount.trim().split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}
export function fromCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
