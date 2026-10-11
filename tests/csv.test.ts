import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { invitationEmail } from "@/lib/emails";
import { poFormSchema } from "@/lib/validators/ops";

describe("csv", () => {
  it("neutralizes spreadsheet formulas in text but leaves numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    for (const f of ["+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) expect(csvCell(f).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("normal")).toBe("normal");
  });
  it("quotes commas, quotes and newlines, and writes empty for null", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("writes headers and CRLF rows", () => {
    expect(toCsv([{ a: 1, b: "x,y" }], [{ key: "a", header: "A" }, { key: "b", header: "B" }])).toBe('A,B\r\n1,"x,y"\r\n');
  });
});

describe("invitation email and PO form", () => {
  it("escapes the organization and inviter names", () => {
    const m = invitationEmail({ organization: "<b>Evil</b> & Co", role: "staff", inviter: "<i>Mallory</i>", link: "https://x.test/invite/abc" });
    expect(m.html).not.toContain("<b>Evil");
    expect(m.html).toContain("&lt;b&gt;Evil&lt;/b&gt; &amp; Co");
    expect(m.text).toContain("https://x.test/invite/abc");
  });
  const v = "00000000-0000-4000-8000-000000000001";
  const s = "00000000-0000-4000-8000-000000000002";
  const line = { variantId: v, quantity: "10", unitCost: "12.50" };
  it("validates purchase order forms, including duplicate lines and bad numbers", () => {
    expect(poFormSchema.safeParse({ supplierId: s, expectedAt: "", notes: "", lines: [line] }).success).toBe(true);
    expect(poFormSchema.safeParse({ supplierId: "", expectedAt: "", notes: "", lines: [line] }).success).toBe(false);
    expect(poFormSchema.safeParse({ supplierId: s, expectedAt: "", notes: "", lines: [] }).success).toBe(false);
    expect(poFormSchema.safeParse({ supplierId: s, expectedAt: "", notes: "", lines: [line, line] }).success).toBe(false);
    expect(poFormSchema.safeParse({ supplierId: s, expectedAt: "", notes: "", lines: [{ ...line, quantity: "0" }] }).success).toBe(false);
    expect(poFormSchema.safeParse({ supplierId: s, expectedAt: "tomorrow", notes: "", lines: [line] }).success).toBe(false);
  });
});
