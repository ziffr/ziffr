"use client";
// GLOSSARY: Workspace Role, Group, Contact, Invitation. Members and Groups as three tabs (People, Groups, Contacts),
// the open tab in the address (`?tab=groups`). People is one row per person with search and filters; a row and a Group
// open in the side panel (spec 0050), where everything about them is changed.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { shown, unwrap } from "@/lib/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSlideOver } from "@/components/slide-over-host";
import { createGroup, decideJoin, inviteEveryone, resendInvitation, revokeInvitation, setHeldRole } from "@/app/team-actions";
import type { WorkspaceRoleName } from "@ziffr/core/actor";
import { formatDate } from "@ziffr/core/format";
import { Contacts } from "./screen";
import { GroupPanel, InvitePanel, PersonPanel, ROLES } from "./team-panels";
import { setTeamData, type TeamData } from "./team-store";

const TABS = [{ id: "people", label: "People" }, { id: "groups", label: "Groups" }, { id: "contacts", label: "Contacts" }] as const;
type TabId = (typeof TABS)[number]["id"];
const field = "h-9 rounded-[var(--radius-input)] border border-input bg-card px-2 text-sm";

/** The page body: the tab bar and the open tab. */
export function TeamTabs({ data }: { data: TeamData }) {
  // The latest data goes where the side panels read it (they are drawn outside this tree).
  useEffect(() => { setTeamData(data); }, [data]);
  const param = useSearchParams().get("tab");
  const tab: TabId = TABS.some((t) => t.id === param) ? (param as TabId) : "people";
  // pushState, so Back returns to the tab before; Next keeps useSearchParams in step with it.
  const go = (id: TabId) => {
    const url = new URL(window.location.href);
    if (id === "people") url.searchParams.delete("tab"); else url.searchParams.set("tab", id);
    window.history.pushState(null, "", url);
  };
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Members and Groups" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`team-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="team-tabpanel" onClick={() => go(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="team-tabpanel" aria-labelledby={`team-tab-${tab}`}>
        {tab === "people" && <People data={data} />}
        {tab === "groups" && <Groups data={data} />}
        {tab === "contacts" && <Contacts contacts={data.contacts} canEdit={data.canEdit} />}
      </div>
    </div>
  );
}

/** Today as yyyy-mm-dd, to tell Away dates that are over from those that apply. */
const today = () => new Date().toISOString().slice(0, 10);

function People({ data }: { data: TeamData }) {
  const panel = useSlideOver();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [group, setGroup] = useState("");
  const [pending, start] = useTransition();
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  const q = query.trim().toLowerCase();
  const shownPeople = useMemo(() => data.people.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q)) return false;
    if (role && p.workspaceRole !== role) return false;
    if (group && !data.groups.find((g) => String(g.id) === group)?.members.includes(p.id)) return false;
    return true;
  }), [data.people, data.groups, q, role, group]);
  const invitations = data.invitations.filter((i) => !q || (i.email ?? "").toLowerCase().includes(q) || (i.name ?? "").toLowerCase().includes(q));
  const requests = data.joinRequests.filter((r) => !q || r.person.name.toLowerCase().includes(q) || (r.person.email ?? "").toLowerCase().includes(q));
  const held = data.invitations.filter((i) => i.held_at);
  return (
    <section aria-label="People" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" aria-label="Search people" className="w-full sm:w-64" />
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
          <option value="">Any role</option>
          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {data.groups.length > 0 && (
          <select aria-label="Filter by group" value={group} onChange={(e) => setGroup(e.target.value)} className={field}>
            <option value="">Any group</option>
            {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {data.canEdit && <Button className="sm:ml-auto" onClick={() => panel.open({ title: "Invite", description: "Invite people by email or with a link", content: <InvitePanel /> })}><Plus aria-hidden /> Invite</Button>}
      </div>
      {data.canEdit && data.isOwner && held.length > 0 && (
        <div className="space-y-2 rounded-[var(--radius-card)] border border-[var(--color-rule-2)] p-3 text-sm">
          <p><strong>{held.length} people from the imported file are not invited yet.</strong> They are listed below with the address and role the file gave. Nothing has been sent: invite them when you are ready.</p>
          <Button size="sm" disabled={pending} onClick={() => run(async () => { const r = unwrap(await inviteEveryone()); toast.success(r.emailed === r.released ? `Invited ${r.released} people` : `Invited ${r.released} people; ${r.emailed} emails went out, send the others their link yourself`); })}>Invite everyone</Button>
        </div>
      )}
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
        {shownPeople.map((p) => {
          const away = data.away.find((a) => a.user_id === p.id && a.ends >= today());
          const tags = data.groups.filter((g) => g.members.includes(p.id));
          return (
            <li key={p.id}>
              <button type="button" aria-label={`Open ${p.name}`} onClick={() => panel.open({ title: p.name, description: "Role, groups and away dates", content: <PersonPanel id={p.id} /> })}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block font-medium">{p.name}</span>
                  {p.role && <span className="block text-xs text-muted-foreground">{p.role}</span>}
                </span>
                <span className="text-muted-foreground">{ROLES.find((r) => r.id === p.workspaceRole)?.label}</span>
                {tags.length > 0 && <span className="flex flex-wrap gap-1">{tags.map((g) => <span key={g.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">{g.name}</span>)}</span>}
                {away && <span className="text-xs text-muted-foreground">Away {formatDate(away.starts)} – {formatDate(away.ends)}</span>}
                <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              </button>
            </li>
          );
        })}
        {invitations.map((i) => (
          <li key={`inv-${i.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="min-w-0 flex-1 basis-40">
              <span className="block font-medium">{i.name ? `${i.name}, ` : ""}{i.email ?? "Link"}</span>
              <span className="block text-xs text-muted-foreground">
                {i.held_at ? "Not invited yet" : `Invited, until ${formatDate(i.expires_at)}`}
                {data.mailOn && i.email && (i.email_error ? <span className="text-destructive"> · not emailed: {i.email_error}</span> : i.email_sent_at ? ` · emailed${i.email_sends > 1 ? ` ${i.email_sends} times` : ""}` : null)}
              </span>
            </span>
            {i.held_at && data.isOwner ? (
              <select aria-label={`Role of ${i.email}`} className={field} value={i.role} disabled={pending} onChange={(e) => run(() => setHeldRole(i.id, e.target.value as WorkspaceRoleName))}>{["admin", "member", "guest"].map((r) => <option key={r} value={r}>{ROLES.find((x) => x.id === r)?.label}</option>)}</select>
            ) : <span className="text-muted-foreground">{ROLES.find((r) => r.id === i.role)?.label}</span>}
            {data.mailOn && i.email && !i.held_at && i.email_sends < 3 && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resendInvitation(i.id), "Emailed again")}>Resend</Button>}
            <button type="button" aria-label={`Revoke invitation ${i.email ?? "link"}`} disabled={pending} onClick={() => run(() => revokeInvitation(i.id), "Revoked")} className="flex size-7 items-center justify-center rounded-[var(--radius-input)] hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><Trash2 aria-hidden className="size-3.5" /></button>
          </li>
        ))}
        {requests.map((r) => (
          <li key={`req-${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="min-w-0 flex-1 basis-40">{r.person.name}{r.person.email ? ` (${r.person.email})` : ""} asks to join.</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideJoin(r.id, true), "Joined as Member")}>Let in</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideJoin(r.id, false), "Declined")}>Decline</Button>
          </li>
        ))}
        {shownPeople.length + invitations.length + requests.length === 0 && <li className="px-3 py-4 text-muted-foreground">Nobody matches.</li>}
      </ul>
    </section>
  );
}

function Groups({ data }: { data: TeamData }) {
  const panel = useSlideOver();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  return (
    <section aria-label="Groups" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">Share with a group, or limit a question to one, and whoever joins later is included.</p>
        {data.canEdit && <Button className="sm:ml-auto" variant="outline" onClick={() => setCreating((c) => !c)} aria-expanded={creating}><Plus aria-hidden /> New group</Button>}
      </div>
      {creating && data.canEdit && (
        <form className="flex max-w-sm gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { unwrap(await createGroup(name)); setName(""); setCreating(false); }, "Group created"); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New group, e.g. Finance" aria-label="New group name" autoFocus />
          <Button type="submit" variant="outline" disabled={pending || !name.trim()}>Add</Button>
        </form>
      )}
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
        <li className="px-3 py-2">
          <span className="font-medium">Everyone in the workspace</span>
          <span className="block text-xs text-muted-foreground">All members except guests. Ziffr keeps it up to date.</span>
        </li>
        {data.groups.map((g) => (
          <li key={g.id}>
            <button type="button" aria-label={`Open ${g.name}`} onClick={() => panel.open({ title: g.name, description: "The people in this group", content: <GroupPanel id={g.id} /> })}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <span className="min-w-0 flex-1 truncate font-medium">{g.name}</span>
              <span className="text-muted-foreground">{g.members.length} {g.members.length === 1 ? "person" : "people"}</span>
              <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      {!data.canEdit && <p className="text-sm text-muted-foreground">Only owners and admins of the workspace change groups.</p>}
    </section>
  );
}
