"use client";
// Members of the workspace and how people join (GLOSSARY: Workspace Role, Invitation, Domain Joining): roles,
// invitations by email or link, requests to join by company domain. Only Owners and Admins see the controls.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeRole, createInviteLink, decideJoin, inviteEveryone, inviteMember, setHeldRole, removeMemberWithHandover, resendInvitation, revokeInvitation, setDomainJoining } from "@/app/team-actions";
import type { WorkspaceRoleName } from "@ziffr/core/actor";
import type { Profile } from "@ziffr/core/types";
import { formatDate } from "@ziffr/core/format";

const ROLES: { id: WorkspaceRoleName; label: string }[] = [
  { id: "owner", label: "Owner" }, { id: "admin", label: "Admin" }, { id: "member", label: "Member" }, { id: "guest", label: "Guest" },
];
const field = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

/** What an invitation did, from the core's answer: emailed, or made for the person to send the link themselves. */
function invitationMessage(emailed: boolean, email: string, mailOn: boolean): string {
  if (emailed) return `Invitation emailed to ${email}`;
  return mailOn ? "Invitation made, but the email could not be sent: copy the link and send it yourself" : "Invitation made: copy the link and send it yourself, email is not set up";
}

/** Members with their roles, invitations, join requests and domain joining. */
export function Members(props: {
  viewer: string;
  members: { id: string; name: string; role: WorkspaceRoleName }[];
  canEdit: boolean;
  isOwner: boolean;
  invitations: { id: number; email: string | null; role: string; expires_at: string; email_sent_at: string | null; email_sends: number; email_error: string | null; held_at: string | null; name: string | null }[];
  /** Whether this Ziffr sends email (spec 0004): then email invitations say whether they went out, and can be resent. */
  mailOn: boolean;
  joinRequests: { id: number; person: { id: string; name: string; email: string | null } }[];
  joinDomain: string | null;
  myDomain: string | null;
  contacts: Profile[];
  /** A Trial Workspace: invitations go by email only, and Domain Joining is off (spec 0040). */
  trial?: boolean;
}) {
  const { members, canEdit, isOwner } = props;
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRoleName>("member");
  const [contact, setContact] = useState("");
  const [link, setLink] = useState<{ url: string; emailed: boolean | null } | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [successor, setSuccessor] = useState("");
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
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
                    <option value="">Who takes over their Metrics and everything else?</option>
                    {members.filter((x) => x.id !== m.id && x.role !== "guest").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <Button size="sm" variant="outline" disabled={pending || !successor} onClick={() => run(async () => { unwrap(await removeMemberWithHandover(m.id, successor)); setLeaving(null); setSuccessor(""); }, "Removed; their things were handed over")} aria-label={`Remove ${m.name}`}>Remove</Button>
                  <Button size="sm" variant="ghost" onClick={() => setLeaving(null)} aria-label={`Cancel removing ${m.name}`}>Cancel</Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setLeaving(m.id); setSuccessor(members.find((x) => x.role === "owner" && x.id !== m.id)?.id ?? ""); }} aria-label={`Remove ${m.name}…`}>Remove…</Button>
              )
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const made = unwrap(await inviteMember({ email, role, contactPersonId: contact || null })); setLink({ url: made.link, emailed: made.emailed }); toast.success(invitationMessage(made.emailed, email, props.mailOn)); setEmail(""); }); }}>
            <label className="text-xs text-muted-foreground">Invite by email<Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="mt-1 w-64" /></label>
            <label className="text-xs text-muted-foreground">as<select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRoleName)} className={`${field} mt-1 block`}>{grantable.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
            {props.contacts.length > 0 && (
              <label className="text-xs text-muted-foreground">who is the Contact<select value={contact} onChange={(e) => setContact(e.target.value)} className={`${field} mt-1 block`}><option value="">nobody yet</option>{props.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            )}
            <Button type="submit" variant="outline" disabled={pending}>Invite</Button>
            {!props.trial && <Button type="button" variant="ghost" disabled={pending} onClick={() => run(async () => setLink({ url: unwrap(await createInviteLink("member")), emailed: null }), "Link made: nobody was emailed, send it yourself")}><Link2 aria-hidden /> Link for Members</Button>}
          </form>
          {link && (
            <p className="text-sm">{link.emailed === null ? "Send this link:" : link.emailed ? "Emailed. You can also send this link yourself:" : "Not emailed. Send this link yourself:"} <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Invitation link" className={`${field} w-full max-w-xl font-mono`} /></p>
          )}
          {isOwner && props.invitations.some((i) => i.held_at) && (
            <div className="space-y-2 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] p-3 text-sm">
              <p><strong>{props.invitations.filter((i) => i.held_at).length} people from the imported file are not invited yet.</strong> They are listed below with the address and role the file gave. Nothing has been sent: invite them when you are ready.</p>
              <Button size="sm" disabled={pending} onClick={() => run(async () => { const r = unwrap(await inviteEveryone()); toast.success(r.emailed === r.released ? `Invited ${r.released} people` : `Invited ${r.released} people; ${r.emailed} emails went out, send the others their link yourself`); })}>Invite everyone</Button>
            </div>
          )}
          {props.invitations.length > 0 && (
            <ul className="text-sm text-muted-foreground">
              {props.invitations.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  {i.held_at ? <>{i.name ? `${i.name}, ` : ""}{i.email} as {isOwner ? <select aria-label={`Role of ${i.email}`} className={field} value={i.role} disabled={pending} onChange={(e) => run(() => setHeldRole(i.id, e.target.value as WorkspaceRoleName))}>{["admin", "member", "guest"].map((r) => <option key={r} value={r}>{ROLES.find((x) => x.id === r)?.label}</option>)}</select> : ROLES.find((r) => r.id === i.role)?.label}, <span>not invited yet</span></> : <>{i.email ?? "Link"} as {ROLES.find((r) => r.id === i.role)?.label}, until {formatDate(i.expires_at)}</>}
                  {props.mailOn && i.email && (i.email_error ? <span className="text-destructive">· not emailed: {i.email_error}</span> : i.email_sent_at ? <span>· emailed{i.email_sends > 1 ? ` ${i.email_sends} times` : ""}</span> : null)}
                  {props.mailOn && i.email && !i.held_at && i.email_sends < 3 && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resendInvitation(i.id), "Emailed again")}>Resend</Button>}
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
          {isOwner && !props.trial && (
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
