import Link from "next/link";
import { SignupForm } from "@/components/auth/AuthForms";
import { ConfigNotice } from "@/components/auth/ConfigNotice";

export default function SignupPage() {
  return (
    <>
      <h1 className="font-display text-3xl">Create your account</h1>
      <div className="mt-5">
        <ConfigNotice />
        <SignupForm />
      </div>
      <p className="mt-5 text-sm text-muted">
        Already have an account? <Link href="/login" className="text-fg underline">Sign in</Link>
      </p>
    </>
  );
}
