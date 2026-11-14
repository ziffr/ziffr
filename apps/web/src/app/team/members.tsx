"use client";
// Members of the workspace and how people join (GLOSSARY: Workspace Role, Invitation, Domain Joining): roles,
// invitations by email or link, requests to join by company domain. Only Owners and Admins see the controls.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeRole, createInviteLink, decideJoin, inviteMember, removeMemberWithHandover, resendInvitation, revokeInvitation, setDomainJoining } from "@/app/team-actions";
import type { WorkspaceRoleName } from "@ziffr/core/actor";
import type { Profile } from "@ziffr/core/types";

const ROLES: { id: WorkspaceRoleName; label: string }[] = [
  { id: "owner", label: "Owner" }, { id: "admin", label: "Admin" }, { id: "member", label: "Member" }, { id: "guest", label: "Guest" },
];
const field = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

/** Members with their roles, invitations, join requests and domain joining. */
export function Members(props: {
  viewer: string;
  members: { id: string; name: string; role: WorkspaceRoleName }[];
  canEdit: boolean;
  isOwner: boolean;
  invitations: { id: number; email: string | null; role: string; expires_at: string; email_sent_at: string | null; email_sends: number; email_error: string | null }[];
  /** Whether this Ziffr sends email (spec 0004): then email invitations say whether they went out, and can be resent. */
  mailOn: boolean;
  joinRequests: { id: number; person: { id: string; name: string; email: string | null } }[];
  joinDomain: string | null;
  myDomain: string | null;
  contacts: Profile[];
}) {
  const { members, canEdit, isOwner } = props;
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRoleName>("member");
  const [contact, setContact] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [successor, setSuccessor] = useState("");
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });
  const grantable = ROLES.filter((r) => isOwner || r.id !== "owner");
  return (
    <section aria-labelledby="members-heading" className="space-y-4">
      <h2 id="members-heading" className="font-medium">Members</h2>
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2">
            <span className="font-medium">{m.name}</span>
            {canEdit && (isOwner || m.role !== "owner") ? (
              <select aria-label={`Role of ${m.name}`} value={m.role} disabled={pending} className={`${field} ml-auto`} onChange={(e) => run(() => changeRole(m.id, e.target.value as WorkspaceRoleName), "Role changed")}>
                {grantable.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            ) : (
              <span className="ml-auto text-muted-foreground">{ROLES.find((r) => r.id === m.role)?.label}</span>
            )}
            {canEdit && m.id !== props.viewer && (isOwner || m.role !== "owner") && (
              leaving === m.id ? (
                <span className="flex items-center gap-2">
                  <select aria-label={`Who takes over from ${m.name}`} value={successor} onChange={(e) => setSuccessor(e.target.value)} className={field}>
                    <option value="">Who takes over?</option>
                    {members.filter((x) => x.id !== m.id && x.role !== "guest").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <Button size="sm" variant="outline" disabled={pending || !successor} onClick={() => run(async () => { await removeMemberWithHandover(m.id, successor); setLeaving(null); setSuccessor(""); }, "Removed; their things were handed over")}>Remove</Button>
                  <Button size="sm" variant="ghost" onClick={() => setLeaving(null)}>Cancel</Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setLeaving(m.id); setSuccessor(""); }}>Remove…</Button>
              )
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { setLink(await inviteMember({ email, role, contactPersonId: contact || null })); setEmail(""); }, props.mailOn ? "Invitation made and emailed" : "Invitation made"); }}>
            <label className="text-xs text-muted-foreground">Invite by email<Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="mt-1 w-64" /></label>
            <label className="text-xs text-muted-foreground">as<select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRoleName)} className={`${field} mt-1 block`}>{grantable.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
            {props.contacts.length > 0 && (
              <label className="text-xs text-muted-foreground">who is the Contact<select value={contact} onChange={(e) => setContact(e.target.value)} className={`${field} mt-1 block`}><option value="">nobody yet</option>{props.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            )}
            <Button type="submit" variant="outline" disabled={pending}>Invite</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(async () => setLink(await createInviteLink("member")), "Link made")}><Link2 aria-hidden /> Link for Members</Button>
          </form>
          {link && (
            <p className="text-sm">{props.mailOn ? "Emailed. You can also send this link yourself:" : "Send this link:"} <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invitation link" className={`${field} w-full max-w-xl font-mono`} /></p>
          )}
          {props.invitations.length > 0 && (
            <ul className="text-sm text-muted-foreground">
              {props.invitations.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  {i.email ?? "Link"} as {ROLES.find((r) => r.id === i.role)?.label}, until {i.expires_at.slice(0, 10)}
                  {props.mailOn && i.email && (i.email_error ? <span className="text-destructive">· not emailed: {i.email_error}</span> : i.email_sent_at ? <span>· emailed{i.email_sends > 1 ? ` ${i.email_sends} times` : ""}</span> : null)}
                  {props.mailOn && i.email && i.email_sends < 3 && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resendInvitation(i.id), "Emailed again")}>Resend</Button>}
                  <button type="button" aria-label={`Revoke invitation ${i.email ?? "link"}`} disabled={pending} onClick={() => run(() => revokeInvitation(i.id), "Revoked")} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><Trash2 aria-hidden className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          {props.joinRequests.length > 0 && (
            <ul className="space-y-1 text-sm">
              {props.joinRequests.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  {r.person.name}{r.person.email ? ` (${r.person.email})` : ""} asks to join.
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideJoin(r.id, true), "Joined as Member")}>Let in</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideJoin(r.id, false), "Declined")}>Decline</Button>
                </li>
              ))}
            </ul>
          )}
          {isOwner && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(props.joinDomain)} disabled={pending || (!props.joinDomain && !props.myDomain)} onChange={(e) => run(() => setDomainJoining(e.target.checked))} className="size-4 accent-[var(--color-ink)]" />
              {props.joinDomain ? `People with an address at ${props.joinDomain} may ask to join` : props.myDomain ? `Let people with an address at ${props.myDomain} ask to join` : "Domain joining needs a verified company address"}
            </label>
          )}
        </div>
      )}
    </section>
  );
}
