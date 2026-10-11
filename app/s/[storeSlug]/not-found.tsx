import Link from "next/link";

export default function StoreNotFound() {
  return (
    <div className="store-theme grid min-h-[60vh] place-items-center px-5 text-center">
      <div>
        <h1 className="font-display text-5xl">Not found.</h1>
        <p className="mt-2 text-sm text-muted">That page or product doesn&apos;t exist, or isn&apos;t for sale right now.</p>
        <Link href="/" className="mt-6 inline-block text-sm underline">Back to Nexora</Link>
      </div>
    </div>
  );
}
