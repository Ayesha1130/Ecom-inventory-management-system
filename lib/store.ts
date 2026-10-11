import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { EMPTY_CART, cartSchema, storeInfoSchema, type Cart } from "@/lib/validators/storefront";

export const STORE_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const cartCookieName = (slug: string) => `nx_cart_${slug}`;
export const newCartToken = () => randomBytes(32).toString("base64url"); // 43 chars, 256 bits

export const cartCookieOptions = {
  httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production",
  path: "/", maxAge: 60 * 60 * 24 * 30,
};

/** Returns store info, or calls notFound() for unknown / unpublished stores. */
export const requireStore = cache(async (slug: string) => {
  if (slug.length < 3 || slug.length > 40 || !STORE_SLUG_RE.test(slug)) notFound();
  const { data, error } = await createPublicClient().rpc("storefront_info", { p_store: slug });
  if (error) throw new Error("Couldn't load the store.");
  if (!data) notFound();
  return storeInfoSchema.parse(data);
});

export const getCart = cache(async (slug: string): Promise<Cart> => {
  const token = (await cookies()).get(cartCookieName(slug))?.value;
  if (!token || !TOKEN_RE.test(token)) return EMPTY_CART;
  const { data, error } = await createPublicClient().rpc("cart_get", { p_store: slug, p_token: token });
  if (error) return EMPTY_CART;
  return cartSchema.parse(data);
});
