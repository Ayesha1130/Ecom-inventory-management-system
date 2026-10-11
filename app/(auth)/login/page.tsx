import Link from "next/link";
import { LoginForm } from "@/components/auth/AuthForms";
import { ConfigNotice } from "@/components/auth/ConfigNotice";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="font-display text-3xl">Sign in</h1>
      <div className="mt-5">
        <ConfigNotice />
        {error === "callback" && (
          <p role="alert" className="mb-4 text-sm text-red-300">That confirmation link is invalid or expired.</p>
        )}
        <LoginForm next={next} />
      </div>
      <p className="mt-5 text-sm text-muted">
        New here? <Link href="/signup" className="text-fg underline">Create an account</Link> or{" "}
        <Link href="/demo" className="text-fg underline">explore the demo</Link>.
      </p>
    </>
  );
}
