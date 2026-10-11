/**
 * Minimal RFC 4180 CSV writer with spreadsheet-injection protection: text cells that start with = + - @ (or a
 * tab/CR) are prefixed with an apostrophe so Excel/Sheets show them as text instead of evaluating them as formulas.
 * Numbers are written as-is, so negative amounts stay numeric.
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, CsvValue>>(rows: T[], columns: { key: keyof T & string; header: string }[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c.key])).join(","));
  return lines.join("\r\n") + "\r\n";
}
