import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="hero-glow flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-8 font-display text-3xl">Nexora</Link>
      <div className="panel w-full max-w-sm p-6">{children}</div>
    </main>
  );
}
