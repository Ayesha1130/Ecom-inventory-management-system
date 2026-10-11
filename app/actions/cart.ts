"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { friendlyDbError } from "@/lib/db-errors";
import { rateLimit } from "@/lib/rate-limit";
import { STORE_SLUG_RE, TOKEN_RE, cartCookieName, cartCookieOptions, newCartToken } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { cartSchema } from "@/lib/validators/storefront";

type Result = { error?: string; count?: number };
const base = z.object({ slug: z.string().min(3).max(40).regex(STORE_SLUG_RE), variantId: z.string().uuid() });

async function run(slug: string, variantId: string, qty: number, fn: "cart_add" | "cart_set_qty"): Promise<Result> {
  const p = base.extend({ qty: z.number().int().min(fn === "cart_add" ? 1 : 0).max(99) }).safeParse({ slug, variantId, qty });
  if (!p.success) return { error: "That request wasn't valid." };

  const limited = await rateLimit("cart", 60, 60);
  if (!limited.ok) return { error: limited.message };

  const jar = await cookies();
  const existing = jar.get(cartCookieName(slug))?.value;
  const token = existing && TOKEN_RE.test(existing) ? existing : newCartToken();
  if (fn === "cart_set_qty" && token !== existing) return { error: "Your cart has expired. Please add the item again." };

  const { data, error } = await createPublicClient().rpc(fn, { p_store: slug, p_token: token, p_variant: variantId, p_qty: qty });
  if (error) return { error: friendlyDbError(error) };

  jar.set(cartCookieName(slug), token, cartCookieOptions); // set only after a successful write; also slides the expiry
  revalidatePath(`/s/${slug}`, "layout");
  return { count: cartSchema.parse(data).count };
}

export async function addToCartAction(slug: string, variantId: string, qty: number) {
  return run(slug, variantId, qty, "cart_add");
}
export async function setCartQtyAction(slug: string, variantId: string, qty: number) {
  return run(slug, variantId, qty, "cart_set_qty");
}
