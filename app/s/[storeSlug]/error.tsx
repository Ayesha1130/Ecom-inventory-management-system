"use client";

export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md px-5 py-28 text-center">
      <h1 className="font-display text-4xl">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted">We couldn&apos;t load this page. Please try again.</p>
      <button onClick={reset} className="mt-6 rounded-full bg-violet px-6 py-2.5 text-sm font-medium text-white">Try again</button>
    </div>
  );
}
