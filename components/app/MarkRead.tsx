"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { markNotificationsReadAction } from "@/app/actions/team";
import { Button } from "@/components/ui/button";

export function MarkRead({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" disabled={pending} onClick={() => start(async () => {
      const r = await markNotificationsReadAction(slug);
      if (r.error) return void toast.error(r.error);
      router.refresh();
    })}>Mark all as read</Button>
  );
}
