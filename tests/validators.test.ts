import { describe, expect, it } from "vitest";
import { createOrgSchema } from "@/lib/validators/org";
import { signupSchema } from "@/lib/validators/auth";
import { safeNext } from "@/lib/safe-redirect";
import { slugify } from "@/lib/slug";

describe("validators", () => {
  it("normalizes and validates org slugs", () => {
    expect(createOrgSchema.safeParse({ name: "Acme", slug: "Acme-Goods" }).data?.slug).toBe("acme-goods");
    expect(createOrgSchema.safeParse({ name: "Acme", slug: "bad slug!" }).success).toBe(false);
    expect(createOrgSchema.safeParse({ name: "A", slug: "acme" }).success).toBe(false);
  });
  it("rejects weak signups", () => {
    expect(signupSchema.safeParse({ fullName: "Sam Lee", email: "sam@x.co", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ fullName: "Sam Lee", email: "SAM@x.co", password: "longenough1" }).data?.email).toBe("sam@x.co");
  });
  it("slugifies business names", () => {
    expect(slugify("  Alder & Finch Co.  ")).toBe("alder-finch-co");
    expect(slugify("Café Ñandú")).toBe("cafe-nandu");
  });
});

describe("safeNext", () => {
  it("allows only same-site paths", () => {
    expect(safeNext("/o/acme")).toBe("/o/acme");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "", null, undefined]) {
      expect(safeNext(bad as string | null | undefined)).toBe("/onboarding");
    }
  });
});
