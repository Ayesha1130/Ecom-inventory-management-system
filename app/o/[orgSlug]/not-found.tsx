import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="font-display text-4xl">Workspace not found.</h1>
      <p className="mt-2 text-sm text-muted">It doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/onboarding" className="mt-6 inline-block text-sm underline">Go to your workspaces</Link>
    </div>
  );
}
