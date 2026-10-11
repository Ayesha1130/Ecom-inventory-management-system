"use client";
import { useState, useTransition } from "react";
import { acceptInviteAction } from "@/app/actions/team";
import { Button } from "@/components/ui/button";

export function AcceptInvite({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="mt-6 space-y-3">
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        setError(undefined);
        const r = await acceptInviteAction(token); // redirects into the workspace on success
        if (r?.error) setError(r.error);
      })}>{pending ? "Joining…" : "Accept invitation"}</Button>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
