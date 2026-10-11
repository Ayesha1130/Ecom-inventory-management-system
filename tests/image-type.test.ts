import { describe, expect, it } from "vitest";
import { detectImageType } from "@/lib/image-type";
import { fromCents, toCents } from "@/lib/money";
import { friendlyDbError } from "@/lib/db-errors";

const bytes = (...n: number[]) => new Uint8Array(n);

describe("detectImageType", () => {
  it("recognises real image signatures", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext).toBe("jpg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.ext).toBe("png");
    expect(detectImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBP"))?.ext).toBe("webp");
  });
  it("rejects scripts and SVG regardless of filename", () => {
    expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<?php echo 1;"))).toBeNull();
    expect(detectImageType(bytes())).toBeNull();
  });
});

describe("money", () => {
  it("round-trips without float error", () => {
    expect(toCents("12.5")).toBe(1250);
    expect(toCents("0.07")).toBe(7);
    expect(toCents("19.99")).toBe(1999);
    expect(fromCents(1999)).toBe("19.99");
    expect(fromCents(5)).toBe("0.05");
  });
});

describe("friendlyDbError", () => {
  it("hides internals but keeps useful domain messages", () => {
    expect(friendlyDbError({ code: "XX000", message: "relation secret_table failed" })).not.toMatch(/secret/);
    expect(friendlyDbError({ code: "23514", message: "Only 20 units are available to transfer" })).toMatch(/Only 20/);
    expect(friendlyDbError({ code: "23505", message: 'duplicate key ... "product_variants_organization_id_sku_key"' })).toMatch(/SKU/);
  });
});
