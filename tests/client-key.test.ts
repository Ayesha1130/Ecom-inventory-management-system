import { describe, expect, it } from "vitest";
import { clientKey } from "@/lib/client-key";

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });

describe("clientKey", () => {
  it("uses the first forwarded hop and never exposes the raw address", () => {
    const k = clientKey(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain("203");
    expect(clientKey(h({ "x-forwarded-for": "203.0.113.7" }))).toBe(k);
    expect(clientKey(h({ "x-forwarded-for": "203.0.113.8" }))).not.toBe(k);
  });
  it("falls back to x-real-ip, and groups unusable values together instead of trusting them", () => {
    expect(clientKey(h({ "x-real-ip": "198.51.100.2" }))).toBe(clientKey(h({ "x-forwarded-for": "198.51.100.2" })));
    const unknown = clientKey(h({}));
    for (const junk of ["<script>", "a".repeat(100), "drop table;"]) expect(clientKey(h({ "x-forwarded-for": junk }))).toBe(unknown);
  });
  it("treats IPv6 addresses case-insensitively", () => {
    expect(clientKey(h({ "x-forwarded-for": "2001:DB8::1" }))).toBe(clientKey(h({ "x-forwarded-for": "2001:db8::1" })));
  });
});
