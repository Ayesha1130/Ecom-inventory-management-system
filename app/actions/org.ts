"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrgSchema, type CreateOrgValues } from "@/lib/validators/org";
import type { ActionResult } from "./auth";

export async function createOrganizationAction(values: CreateOrgValues): Promise<ActionResult & { field?: "slug" }> {
  const parsed = createOrgSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) {
    if (error.code === "23505") return { error: "That URL is already taken.", field: "slug" };
    if (error.code === "42501") return { error: "Demo sessions can't create organizations. Sign up for an account first." };
    if (error.code === "53400") return { error: "You've reached the organization limit." };
    if (error.code === "28000") redirect("/login");
    return { error: "Something went wrong creating your organization." };
  }
  redirect(`/o/${parsed.data.slug}`);
}
