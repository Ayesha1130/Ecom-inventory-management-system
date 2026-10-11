import { describe, expect, it } from "vitest";
import { TOKEN_RE, STORE_SLUG_RE, newCartToken } from "@/lib/store";
import { readableOn, swatchColor } from "@/lib/colors";

describe("cart tokens", () => {
  it("generates unguessable tokens that pass validation", () => {
    const a = newCartToken(), b = newCartToken();
    expect(a).toMatch(TOKEN_RE);
    expect(a).not.toBe(b);
  });
  it("rejects malformed tokens and slugs", () => {
    for (const bad of ["", "short", "a".repeat(44), "a".repeat(42) + "!", "../etc/passwd"]) expect(TOKEN_RE.test(bad)).toBe(false);
    for (const bad of ["Has Space", "UPPER", "-lead", "a--b", "../x"]) expect(STORE_SLUG_RE.test(bad)).toBe(false);
    expect(STORE_SLUG_RE.test("alder-finch")).toBe(true);
  });
});

describe("colors", () => {
  it("maps known names, falls back safely, and picks readable text", () => {
    expect(swatchColor("Ink")).toBe("#1f2430");
    expect(swatchColor("Unobtainium")).toMatch(/^#[0-9a-f]{6}$/);
    expect(swatchColor(null)).toMatch(/^#/);
    expect(readableOn("#171717")).toBe("#f6f2ea");
    expect(readableOn("#e3d9c3")).toBe("#1c1b18");
  });
});
