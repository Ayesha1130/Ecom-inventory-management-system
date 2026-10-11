"use client";
import { Button } from "@/components/ui/button";

export default function ErrorState({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-24 text-center">
      <h1 className="font-display text-4xl">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted">We couldn&apos;t load this page. Your data is safe.</p>
      <Button onClick={reset} className="mt-6">Try again</Button>
    </div>
  );
}
