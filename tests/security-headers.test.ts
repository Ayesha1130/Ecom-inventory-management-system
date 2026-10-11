import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/security-headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(name + " "))?.slice(name.length + 1).split(" ") ?? [];

describe("content security policy", () => {
  const prod = buildCsp({ supabaseUrl: "https://abc.supabase.co/rest/v1/", dev: false });

  it("forbids framing, plugins and foreign base URIs, and allows only known form targets", () => {
    expect(directive(prod, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(prod, "object-src")).toEqual(["'none'"]);
    expect(directive(prod, "base-uri")).toEqual(["'self'"]);
    expect(directive(prod, "form-action")).toEqual(["'self'", "https://checkout.stripe.com"]);
    expect(directive(prod, "default-src")).toEqual(["'self'"]);
  });

  it("never uses wildcards or eval in production and allows only this site's Supabase origin", () => {
    expect(prod).not.toMatch(/\*/);
    expect(directive(prod, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(prod, "connect-src")).toEqual(["'self'", "https://abc.supabase.co"]);
    expect(directive(prod, "img-src")).toContain("https://abc.supabase.co");
    expect(prod).toContain("upgrade-insecure-requests");
  });

  it("relaxes only what the dev server needs", () => {
    const dev = buildCsp({ dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("ignores a malformed Supabase URL instead of weakening the policy", () => {
    const csp = buildCsp({ supabaseUrl: "not a url" });
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
  });
});

describe("security headers", () => {
  it("sets the baseline set, with HSTS only in production", () => {
    const names = (dev: boolean) => securityHeaders({ dev }).map((h) => h.key);
    expect(names(false)).toEqual(expect.arrayContaining(["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy", "Strict-Transport-Security"]));
    expect(names(true)).not.toContain("Strict-Transport-Security");
    expect(securityHeaders().find((h) => h.key === "X-Content-Type-Options")?.value).toBe("nosniff");
  });
});
