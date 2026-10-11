"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changeMemberRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";

type Role = "staff" | "manager" | "admin" | "owner";
const ORDER: Role[] = ["staff", "manager", "admin", "owner"];
const rank = (r: Role) => ORDER.indexOf(r);
type Member = { user_id: string; role: Role; full_name: string | null; email: string | null; joined_at: string; is_you: boolean };
type Invite = { id: string; email: string; role: string; expires_at: string };

export function TeamManager({ slug, members, invitations, myRole }: { slug: string; members: Member[]; invitations: Invite[]; myRole: Role }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "manager" | "admin">("staff");
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<{ url: string; emailed: boolean }>();
  const [removing, setRemoving] = useState<Member | null>(null);
  const isAdmin = rank(myRole) >= rank("admin");

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (r.error) return void toast.error(r.error);
    toast.success(ok); after?.(); router.refresh();
  });
  const inviteRoles = (["staff", "manager", "admin"] as const).filter((r) => rank(r) <= rank(myRole));

  return (
    <div className="space-y-6">
      <section className="panel overflow-x-auto" aria-labelledby="members-h">
        <h2 id="members-h" className="px-5 pt-5 font-medium">Members ({members.length})</h2>
        <table className="mt-3 w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Team members</caption>
          <thead className="border-y border-line text-xs text-muted"><tr>
            <th className="px-5 py-2.5 font-normal">Person</th><th className="px-5 py-2.5 font-normal">Role</th><th className="px-5 py-2.5 font-normal">Joined</th><th className="px-5 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {members.map((m) => {
              const canEdit = isAdmin && !m.is_you && rank(m.role) <= rank(myRole);
              return (
                <tr key={m.user_id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">{m.full_name ?? m.email ?? "Member"}{m.is_you && <span className="ml-2 text-xs text-muted">(you)</span>}<p className="text-xs text-muted">{m.email}</p></td>
                  <td className="px-5 py-3">
                    {canEdit ? (
                      <select aria-label={`Role for ${m.email ?? "member"}`} value={m.role} disabled={pending}
                        onChange={(e) => run(() => changeMemberRoleAction(slug, m.user_id, e.target.value), "Role updated")}
                        className="rounded-lg border border-line bg-raised px-2 py-1.5 text-sm">
                        {ORDER.filter((r) => rank(r) <= rank(myRole)).map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : <span className="capitalize">{m.role}</span>}
                  </td>
                  <td className="px-5 py-3 text-muted">{formatDateTime(m.joined_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {(canEdit || m.is_you) && <button type="button" onClick={() => setRemoving(m)} className="text-sm text-muted underline hover:text-fg">{m.is_you ? "Leave" : "Remove"}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {isAdmin && (
        <section className="panel p-5" aria-labelledby="invite-h">
          <h2 id="invite-h" className="mb-4 font-medium">Invite someone</h2>
          <form className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(undefined);
              const r = await inviteMemberAction(slug, { email, role: inviteRole });
              if (r.error) return void setError(r.error);
              setLink({ url: r.link!, emailed: !!r.emailed }); setEmail(""); router.refresh();
            });
          }}>
            <Field id="inv-email" label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <SelectField id="inv-role" label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}>
              {inviteRoles.map((r) => <option key={r} value={r}>{r}</option>)}
            </SelectField>
            <Button type="submit" disabled={pending}>{pending ? "Inviting…" : "Send invite"}</Button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        </section>
      )}

      {isAdmin && invitations.length > 0 && (
        <section className="panel p-5" aria-labelledby="pending-h">
          <h2 id="pending-h" className="mb-3 font-medium">Pending invitations</h2>
          <ul className="divide-y divide-line text-sm">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 py-2.5">
                <span>{i.email} <span className="text-muted">as {i.role}, expires {formatDateTime(i.expires_at)}</span></span>
                <button type="button" disabled={pending} onClick={() => run(() => revokeInvitationAction(slug, i.id), "Invitation revoked")} className="text-muted underline hover:text-fg">Revoke</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={!!link} onClose={() => setLink(undefined)} title="Invitation created">
        <p className="text-sm text-muted">{link?.emailed ? "We emailed them this link. You can also share it yourself:" : "Email isn't configured, so nothing was sent. Share this link with them directly:"}</p>
        <input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" className="mt-3 w-full rounded-lg border border-line bg-raised px-3 py-2 font-mono text-xs" />
        <p className="mt-2 text-xs text-muted">The link works once, for that email address only, and expires in 7 days. It can&apos;t be shown again.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(link?.url ?? "").then(() => toast.success("Copied"))}>Copy link</Button>
          <Button onClick={() => setLink(undefined)}>Done</Button>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title={removing?.is_you ? "Leave this workspace?" : "Remove this member?"}>
        <p className="text-sm text-muted">{removing?.is_you ? "You'll lose access immediately." : `${removing?.email ?? "They"} will lose access immediately.`}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button className="bg-red-500 hover:bg-red-500/90" disabled={pending}
            onClick={() => removing && run(() => removeMemberAction(slug, removing.user_id), removing.is_you ? "You left" : "Member removed", () => setRemoving(null))}>
            {removing?.is_you ? "Leave" : "Remove"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
