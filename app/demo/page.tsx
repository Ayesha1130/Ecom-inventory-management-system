import Link from "next/link";
import { demoSignInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getSupabaseEnv } from "@/lib/env";

const errors: Record<string, string> = {
  config: "The backend isn't configured in this environment yet.",
  anon: "Demo sessions are unavailable. Anonymous sign-ins must be enabled in Supabase Auth.",
  limit: "Too many demo sessions from your network. Please try again later.",
};

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const configured = !!getSupabaseEnv();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <h1 className="font-display text-5xl leading-none">Explore a live workspace.</h1>
      <p className="mt-4 text-muted">
        You&apos;ll enter Alder &amp; Finch, a fictional store with simulated products and orders. The session is
        anonymous and read-only: no email, no password, and nothing you do changes the data.
      </p>
      {(error || !configured) && (
        <p role="alert" className="mt-5 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          {errors[error ?? "config"] ?? errors.config}
        </p>
      )}
      <form action={demoSignInAction} className="mt-8">
        <Button type="submit" disabled={!configured}>Enter the demo</Button>
      </form>
      <Link href="/" className="mt-6 w-fit text-sm text-muted underline">Back to the homepage</Link>
    </main>
  );
}
