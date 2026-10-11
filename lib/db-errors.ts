type PgError = { code?: string; message: string };

/** Map Postgres errors to messages safe to show. Unknown errors never leak internals. */
export function friendlyDbError(error: PgError): string {
  const m = error.message;
  switch (error.code) {
    case "23505":
      if (m.includes("sku")) return "That SKU is already used by another variant.";
      if (m.includes("slug")) return "That URL is already used by another product.";
      if (m.includes("code")) return "That code is already in use.";
      return "That value is already in use.";
    case "23503":
      return "This has stock history and can't be deleted. Archive the product instead.";
    case "42501":
      return "You don't have permission to do that.";
    case "P0002":
      return "That item no longer exists. Refresh and try again.";
    case "23514":
    case "22023":
      return m.includes("violates") ? "That change isn't allowed." : m;
    default:
      return "Something went wrong. Please try again.";
  }
}
