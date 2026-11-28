"use client";
// GLOSSARY: Slide-over, Workspace Role, Group, Away, Invitation. The side panels of Members and Groups: one person
// (role, Groups, Away dates, Transfer ownership, Remove), one Group (its people, rename, delete) and Invite. Each reads the page's latest
// data from the team store, so what it shows follows every change. Controls a person may not use are not drawn; the
// server actions check the same rules again.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link2, X } from "lucide-react";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm-dialog";
import { useSlideOver } from "@/components/slide-over-host";
import { InviteLock, useInviteGate } from "@/components/invite-lock";
import { changeRole, createInviteLink, deleteGroup, inviteMember, removeMemberWithHandover, renameGroup, setDomainJoining, setMember, transferOwnership } from "@/app/team-actions";
import type { WorkspaceRoleName } from "@ziffr/core/actor";
import { WORKSPACE_ROLE_ORDER, WORKSPACE_ROLE_WORDS } from "@ziffr/core/role-words";
import { BUSINESS_FUNCTION_LABELS } from "@ziffr/pack/business-functions";
import { AwayDates } from "./screen";
import { useTeamData } from "./team-store";

// The role names come from the one place that words them, which the Setup Guide's Team step uses as well.
export const ROLES: { id: WorkspaceRoleName; label: string }[] = WORKSPACE_ROLE_ORDER.map((id) => ({ id, label: WORKSPACE_ROLE_WORDS[id].label }));
const field = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

/** Runs a server action, says so in a toast and reports a refusal in words. */
function useRun() {
  const [pending, start] = useTransition();
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  return { pending, run };
}

/** What an invitation did, from the core's answer: emailed, or made for the person to send the link themselves. */
function invitationMessage(emailed: boolean, email: string, mailOn: boolean): string {
  if (emailed) return `Invitation emailed to ${email}`;
  return mailOn ? "Invitation made, but the email could not be sent: copy the link and send it yourself" : "Invitation made: copy the link and send it yourself, email is not set up";
}

/** The panel of one person: role, Groups, Away dates, Transfer ownership for an Owner and, at the bottom, Remove. */
export function PersonPanel({ id }: { id: string }) {
  const data = useTeamData();
  const panel = useSlideOver();
  const { pending, run } = useRun();
  const [leaving, setLeaving] = useState(false);
  const [successor, setSuccessor] = useState("");
  const { confirm, dialog } = useConfirm();
  const person = data?.people.find((p) => p.id === id);
  if (!data || !person) return <p className="text-sm text-muted-foreground">This person is no longer in the workspace.</p>;
  const { canEdit, isOwner, viewer } = data;
  const mayChange = canEdit && (isOwner || person.workspaceRole !== "owner");
  const grantable = ROLES.filter((r) => isOwner || r.id !== "owner");
  const fn = data.functions?.find((f) => f.personId === person.id);
  const mine = data.groups.filter((g) => g.members.includes(person.id));
  return (
    <div className="space-y-6 text-sm">
      <div>
        <p className="text-base font-medium">{person.name}</p>
        {person.role && <p className="text-muted-foreground">{person.role}</p>}
        {fn && <p className="text-muted-foreground">Works in {BUSINESS_FUNCTION_LABELS[fn.function]}</p>}
      </div>
      <section aria-labelledby="person-role" className="space-y-2">
        <h3 id="person-role" className="font-medium">Role</h3>
        {mayChange ? (
          <select aria-label={`Role of ${person.name}`} value={person.workspaceRole} disabled={pending} className={field} onChange={(e) => run(() => changeRole(person.id, e.target.value as WorkspaceRoleName), "Role changed")}>
            {grantable.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        ) : (
          <p>{ROLES.find((r) => r.id === person.workspaceRole)?.label}</p>
        )}
      </section>
      <section aria-labelledby="person-groups" className="space-y-2">
        <h3 id="person-groups" className="font-medium">Groups</h3>
        {data.groups.length === 0 ? <p className="text-muted-foreground">There are no groups yet.</p> : canEdit ? (
          <ul className="space-y-1">
            {data.groups.map((g) => (
              <li key={g.id}>
                <label className="flex items-center gap-2 max-sm:min-h-11">
                  <input type="checkbox" aria-label={`${person.name} in ${g.name}`} checked={g.members.includes(person.id)} disabled={pending} onChange={(e) => run(() => setMember(g.id, person.id, e.target.checked))} className="size-4 accent-[var(--color-ink)]" />
                  {g.name}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p>{mine.length ? mine.map((g) => g.name).join(", ") : "In no group."}</p>
        )}
      </section>
      <section aria-labelledby="person-away" className="space-y-2">
        <h3 id="person-away" className="font-medium">Away</h3>
        <p className="text-muted-foreground">While someone is away, Prompts meant for them go to their Stand-in.</p>
        <AwayDates userId={person.id} current={data.away.find((a) => a.user_id === person.id)} can={canEdit || person.id === viewer} />
      </section>
      {data.canTransfer && person.id !== viewer && (person.workspaceRole === "admin" || person.workspaceRole === "member") && (
        <section aria-labelledby="person-transfer" className="space-y-2 border-t border-border pt-4">
          <h3 id="person-transfer" className="font-medium">Transfer ownership</h3>
          <p className="text-muted-foreground">{person.name} becomes an Owner and you become an Admin.</p>
          <Button size="sm" variant="outline" disabled={pending} onClick={async () => {
            if (await confirm({
              title: `Transfer ownership to ${person.name}?`,
              description: `${person.name} becomes an Owner and you become an Admin. Billing and removing Owners go with the role, so you can no longer do either, and only an Owner can make you one again. Other Owners keep their role. What each of you owns, such as Metrics and dashboards, does not move.${data.mailOn ? " Both of you are emailed." : ""}`,
              confirmLabel: "Transfer ownership",
            })) run(() => transferOwnership(person.id), "Ownership transferred; you are now an Admin");
          }}>Transfer ownership…</Button>
        </section>
      )}
      {mayChange && person.id !== viewer && (
        <section aria-labelledby="person-remove" className="space-y-2 border-t border-border pt-4">
          <h3 id="person-remove" className="font-medium">Remove from the workspace</h3>
          {leaving ? (
            <div className="space-y-2">
              <select aria-label={`Who takes over from ${person.name}`} value={successor} onChange={(e) => setSuccessor(e.target.value)} className={`${field} w-full`}>
                <option value="">Who takes over their Metrics and everything else?</option>
                {data.people.filter((x) => x.id !== person.id && x.workspaceRole !== "guest").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pending || !successor} aria-label={`Remove ${person.name}`}
                  onClick={() => run(async () => { unwrap(await removeMemberWithHandover(person.id, successor)); panel.close(); }, "Removed; their things were handed over")}>Remove</Button>
                <Button size="sm" variant="ghost" aria-label={`Cancel removing ${person.name}`} onClick={() => setLeaving(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" disabled={pending} aria-label={`Remove ${person.name}…`} onClick={() => { setLeaving(true); setSuccessor(data.people.find((x) => x.workspaceRole === "owner" && x.id !== person.id)?.id ?? ""); }}>Remove…</Button>
          )}
        </section>
      )}
      {dialog}
    </div>
  );
}

/** The panel of one Group: its people with Add people, rename and delete. Everyone may look; only Owners and Admins change it. */
export function GroupPanel({ id }: { id: number }) {
  const data = useTeamData();
  const panel = useSlideOver();
  const { pending, run } = useRun();
  const { confirm, dialog } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const group = data?.groups.find((g) => g.id === id);
  if (!data || !group) return <p className="text-sm text-muted-foreground">This group no longer exists.</p>;
  const { canEdit } = data;
  const inGroup = data.people.filter((p) => group.members.includes(p.id));
  const q = query.trim().toLowerCase();
  // Guests are never in a Group by the "Everyone" rule, but may be put in any other one, as the old grid allowed.
  const candidates = data.people.filter((p) => !group.members.includes(p.id) && (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)));
  return (
    <div className="space-y-6 text-sm">
      {dialog}
      {canEdit && (
        <label className="block text-xs text-muted-foreground">
          Name
          <Input aria-label={`Name of ${group.name}`} defaultValue={group.name} key={group.name} className="mt-1" disabled={pending}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== group.name) run(() => renameGroup(group.id, v), "Group renamed"); }} />
        </label>
      )}
      <section aria-labelledby="group-people" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="group-people" className="font-medium">People ({inGroup.length})</h3>
          {canEdit && <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>Add people</Button>}
        </div>
        {adding && canEdit && (
          <div className="space-y-2 rounded-[var(--radius-card)] border border-border p-2">
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" aria-label="Search people to add" />
            {candidates.length ? (
              <ul className="max-h-60 divide-y divide-border overflow-y-auto">
                {candidates.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <Button size="sm" variant="ghost" disabled={pending} aria-label={`Add ${p.name} to ${group.name}`} onClick={() => run(() => setMember(group.id, p.id, true))}>Add</Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted-foreground">Nobody to add.</p>}
          </div>
        )}
        {inGroup.length ? (
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
            {inGroup.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {canEdit && <button type="button" disabled={pending} aria-label={`Remove ${p.name} from ${group.name}`} title="Remove from group" onClick={() => run(() => setMember(group.id, p.id, false))} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden className="size-3.5" /></button>}
              </li>
            ))}
          </ul>
        ) : <p className="text-muted-foreground">Nobody is in this group yet.</p>}
      </section>
      {canEdit && (
        <section className="border-t border-border pt-4">
          <Button size="sm" variant="ghost" disabled={pending} aria-label={`Delete ${group.name}`}
            onClick={async () => {
              if (await confirm({ title: `Delete the group ${group.name}?`, description: "What was shared with it stops being shared, and threads limited to it become readable by everyone.", confirmLabel: "Delete group" })) {
                run(async () => { unwrap(await deleteGroup(group.id)); panel.close(); }, "Group deleted");
              }
            }}>Delete group…</Button>
        </section>
      )}
    </div>
  );
}

/** The Invite panel: email and role, a link for Members, and who may ask to join by company domain. Owners and Admins only. */
export function InvitePanel() {
  const data = useTeamData();
  const { pending, run } = useRun();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRoleName>("member");
  const [contact, setContact] = useState("");
  const [link, setLink] = useState<{ url: string; emailed: boolean | null } | null>(null);
  // Only a trial ever closes invitations.
  const invites = useInviteGate(undefined, Boolean(data?.trial && data.canEdit));
  if (!data || !data.canEdit) return null;
  const { closed } = invites;
  const why = closed ? "invite-panel-why" : undefined;
  const grantable = ROLES.filter((r) => data.isOwner || r.id !== "owner");
  return (
    <div className="space-y-5 text-sm">
      <InviteLock {...invites} id="invite-panel-why" onMembers />
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const made = unwrap(await inviteMember({ email, role, contactPersonId: contact || null })); setLink({ url: made.link, emailed: made.emailed }); toast.success(invitationMessage(made.emailed, email, data.mailOn)); setEmail(""); invites.look(); }); }}>
        <label className="block text-xs text-muted-foreground">Invite by email<Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" disabled={closed} aria-describedby={why} className="mt-1" /></label>
        <label className="block text-xs text-muted-foreground">as<select value={role} disabled={closed} onChange={(e) => setRole(e.target.value as WorkspaceRoleName)} className={`${field} mt-1 block w-full disabled:opacity-50`}>{grantable.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        {data.contacts.length > 0 && (
          <label className="block text-xs text-muted-foreground">who is the Contact<select value={contact} disabled={closed} onChange={(e) => setContact(e.target.value)} className={`${field} mt-1 block w-full`}><option value="">nobody yet</option>{data.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" disabled={pending || closed}>Invite</Button>
          {!data.trial && <Button type="button" variant="ghost" disabled={pending} onClick={() => run(async () => setLink({ url: unwrap(await createInviteLink("member")), emailed: null }), "Link made: nobody was emailed, send it yourself")}><Link2 aria-hidden /> Link for Members</Button>}
        </div>
      </form>
      {link && (
        <p>{link.emailed === null ? "Send this link:" : link.emailed ? "Emailed. You can also send this link yourself:" : "Not emailed. Send this link yourself:"} <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Invitation link" className={`${field} mt-1 w-full font-mono`} /></p>
      )}
      {data.isOwner && !data.trial && (
        <label className="flex items-start gap-2 max-sm:min-h-11">
          <input type="checkbox" checked={Boolean(data.joinDomain)} disabled={pending || (!data.joinDomain && !data.myDomain)} onChange={(e) => run(() => setDomainJoining(e.target.checked))} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
          {data.joinDomain ? `People with an address at ${data.joinDomain} may ask to join` : data.myDomain ? `Let people with an address at ${data.myDomain} ask to join` : "Domain joining needs a verified company address"}
        </label>
      )}
    </div>
  );
}
