import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/auth/OnboardingForm";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: wantsNew } = await searchParams;
  const supabase = await createClient();
  // The demo org is readable by everyone, so exclude it: this lists only orgs the user belongs to.
  const { data: orgs } = await supabase.from("organizations").select("name, slug").eq("is_demo", false).order("created_at");

  if (orgs?.length && !wantsNew) redirect(`/o/${orgs[0]!.slug}`);

  return (
    <main className="hero-glow flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="panel w-full max-w-md p-6">
        <h1 className="font-display text-4xl">Set up your workspace</h1>
        <p className="mt-2 text-sm text-muted">You&apos;ll be the owner. You can invite your team later.</p>
        <div className="mt-6"><OnboardingForm /></div>
        {!!orgs?.length && (
          <p className="mt-5 text-sm text-muted">
            Or open an existing workspace:{" "}
            {orgs.map((o) => (
              <Link key={o.slug} href={`/o/${o.slug}`} className="mr-2 text-fg underline">{o.name}</Link>
            ))}
          </p>
        )}
      </div>
    </main>
  );
}
