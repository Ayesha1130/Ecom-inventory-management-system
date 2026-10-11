"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCustomerNoteAction } from "@/app/actions/crm";
import { Button } from "@/components/ui/button";

export function AddNote({ slug, customerId }: { slug: string; customerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        setError(undefined);
        const r = await addCustomerNoteAction(slug, customerId, body);
        if (r.error) return void setError(r.error);
        setBody(""); toast.success("Note added"); router.refresh();
      });
    }}>
      <label htmlFor="note" className="sr-only">Add a note</label>
      <textarea id="note" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add an internal note"
        className="w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-violet" />
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <Button type="submit" variant="ghost" disabled={pending || !body.trim()}>{pending ? "Saving…" : "Add note"}</Button>
    </form>
  );
}
