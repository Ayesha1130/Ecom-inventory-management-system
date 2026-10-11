import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TOKEN_RE } from "@/lib/store";
import { invitationPreviewSchema } from "@/lib/validators/ops";
import { AcceptInvite } from "./AcceptInvite";

// The link carries a secret: keep it out of Referer headers and search indexes.
export const metadata = { title: "Join a workspace", referrer: "no-referrer" as const, robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const preview = user && TOKEN_RE.test(token) ? invitationPreviewSchema.safeParse((await supabase.rpc("invitation_preview", { p_token: token })).data) : null;
  const myEmail = user?.email?.toLowerCase();

  return (
    <main className="hero-glow flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-8 font-display text-3xl">Nexora</Link>
      <div className="panel w-full max-w-sm p-6">
        {!preview?.success ? (
          <>
            <h1 className="font-display text-3xl">Invitation not valid</h1>
            <p className="mt-2 text-sm text-muted">This link is invalid, was already used, or has expired. Ask your team admin to send a new one.</p>
          </>
        ) : user?.is_anonymous ? (
          <>
            <h1 className="font-display text-3xl">Create an account first</h1>
            <p className="mt-2 text-sm text-muted">You&apos;re in a demo session. Sign up with <b>{preview.data.email}</b>, confirm your email, then open this link again.</p>
            <Link href="/signup" className="mt-5 inline-block rounded-full bg-violet px-5 py-2.5 text-sm font-medium">Sign up</Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl">Join {preview.data.organization}</h1>
            <p className="mt-2 text-sm text-muted">You&apos;ve been invited as <b className="text-fg">{preview.data.role}</b>. This invitation is for <b className="text-fg">{preview.data.email}</b>.</p>
            {myEmail !== preview.data.email.toLowerCase() ? (
              <p role="alert" className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                You&apos;re signed in as {myEmail}. Sign in with {preview.data.email} to accept.
              </p>
            ) : <AcceptInvite token={token} />}
          </>
        )}
      </div>
    </main>
  );
}
