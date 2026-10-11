"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema, signupSchema, type LoginValues, type SignupValues } from "@/lib/validators/auth";
import { safeNext } from "@/lib/safe-redirect";
import { DEMO_ORG_SLUG } from "@/lib/demo";

export type ActionResult = { error?: string; message?: string } | undefined;
const NOT_CONFIGURED = { error: "The backend isn't configured yet. See the setup notes in the README." };

export async function loginAction(values: LoginValues, next?: string): Promise<ActionResult> {
  if (!getSupabaseEnv()) return NOT_CONFIGURED;
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  const limited = await rateLimit("login", 10, 600);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is incorrect." }; // same message for every failure
  redirect(safeNext(next));
}

export async function signupAction(values: SignupValues): Promise<ActionResult> {
  if (!getSupabaseEnv()) return NOT_CONFIGURED;
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  const limited = await rateLimit("signup", 5, 3600);
  if (!limited.ok) return { error: limited.message };

  const origin = (await headers()).get("origin") ?? undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });
  if (error) return { error: "We couldn't create that account. Try a different email or sign in." };
  if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  redirect("/onboarding");
}

export async function signOutAction() {
  if (getSupabaseEnv()) await (await createClient()).auth.signOut();
  redirect("/");
}

/** Starts a throwaway anonymous session. RLS makes it read-only on the demo org and nothing else. */
export async function demoSignInAction() {
  if (!getSupabaseEnv()) redirect("/demo?error=config");
  if (!(await rateLimit("demo", 10, 3600)).ok) redirect("/demo?error=limit");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) redirect("/demo?error=anon");
  }
  redirect(`/o/${DEMO_ORG_SLUG}`);
}
