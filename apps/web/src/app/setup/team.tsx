"use client";
// Team, the Setup Guide's last step (spec 0052, ticket 10; GLOSSARY: Setup Guide, Invitation, Workspace Role, Domain
// Joining, Group, Contact, Submitter, Business Function). Only Owners and Admins see it. Everything on it is an operation
// that already exists, called through the Team page's own actions: inviting by email or link, Domain Joining, Groups.
// "Who is asked for what" is new only as a screen: a Business Function is shown in it to Owners and Admins, who may see
// functions anyway, and a suggestion is a button that does nothing until it is pressed.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { createGroup, createInviteLink, inviteMember, setDomainJoining, setMember } from "@/app/team-actions";
import { askForMetric } from "./team-actions";
import { skipStep } from "./actions";
import { PHONE_BUTTON, PHONE_BUTTON_SM, PHONE_FIELD, PHONE_FOOTER } from "./phone";
import { WORKSPACE_ROLE_ORDER, WORKSPACE_ROLE_WORDS } from "@ziffr/core/role-words";
import type { WorkspaceRoleName } from "@ziffr/core/actor";
import type { TeamSetup } from "@ziffr/core/team-setup";


/** The step. `domainOffer` is the company domain Domain Joining could be switched on for, from the Owner's verified address, or null. */
export function TeamStep({ data, domainOffer }: { data: TeamSetup; domainOffer: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRoleName>("member");
  const [link, setLink] = useState<string | null>(null);
  const [group, setGroup] = useState("");
  const [other, setOther] = useState<Record<number, string>>({});
  const grantable = WORKSPACE_ROLE_ORDER.filter((r) => data.isOwner || r !== "owner");
  const closed = !data.trial.invitationsOpen;
  // One press: its words on a refusal, a refresh on success so the lists and the step bar say the new truth.
  const run = (work: () => Promise<unknown>, done?: (r: unknown) => void) => start(async () => {
    const r = await work().catch(() => ({ error: UNEXPECTED }));
    setError(isActionError(r) ? r.error : null);
    if (!isActionError(r)) { done?.(r); router.refresh(); }
  });
  // What was sent to the person asked, which may be nothing new.
  const ask = (metricId: number, personId: string, done?: () => void) => run(() => askForMetric(metricId, personId), (r) => { toast.success("Added", { description: String(r) }); done?.(); });
  const candidates = data.people;
  return (
    <div className="space-y-8">
      {data.trial.ended ? (
        <p role="status" className="rounded-[var(--radius-card)] border border-border p-3 text-sm">This trial has ended, so nobody can be invited any more.</p>
      ) : closed ? (
        <p role="status" className="rounded-[var(--radius-card)] border border-border p-3 text-sm">Invitations open once your first value has arrived. Answer your first request in the First Metric step, then come back here.</p>
      ) : null}

      <section aria-labelledby="team-people">
        <h3 id="team-people" className="text-base font-medium">Who is here</h3>
        <ul className="mt-2 divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
          {data.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">{p.kind === "contact" ? "Contact" : WORKSPACE_ROLE_WORDS[p.role as WorkspaceRoleName]?.label ?? "Member"}</span>
              {p.function && <span className="text-muted-foreground">Works in {p.function}</span>}
            </li>
          ))}
          {data.invitations.map((i) => (
            <li key={`i${i.id}`} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-muted-foreground">
              <span>{i.email ?? "Invitation link"}</span><span>invited as {WORKSPACE_ROLE_WORDS[i.role as WorkspaceRoleName]?.label ?? "Member"}, waiting</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="team-invite">
        <h3 id="team-invite" className="text-base font-medium">Invite people</h3>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Type an address and choose what the person may do. You can invite more later on Members and Groups.</p>
        <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => inviteMember({ email, role }), (r) => { setLink((r as { link: string }).link); setEmail(""); toast.success((r as { emailed: boolean }).emailed ? "Invitation emailed" : data.mailOn ? "Invitation made, but the email could not be sent: send the link yourself" : "Invitation made: send the link yourself, this Ziffr cannot email"); }); }}>
          <label className="block text-sm text-muted-foreground sm:text-xs">Email address<Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" disabled={closed} className="mt-1 h-11 w-full text-base sm:h-9 sm:w-64 sm:text-sm" /></label>
          <label className="block text-sm text-muted-foreground sm:text-xs">Invite as<select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRoleName)} disabled={closed} className={`${PHONE_FIELD} mt-1 block`}>{grantable.map((r) => <option key={r} value={r}>{WORKSPACE_ROLE_WORDS[r].label}</option>)}</select></label>
          <Button type="submit" variant="outline" className={PHONE_BUTTON} disabled={pending || closed}>Invite</Button>
          {!data.trial.onTrial && <Button type="button" variant="ghost" className={PHONE_BUTTON} disabled={pending} onClick={() => run(async () => createInviteLink("member"), (r) => setLink(r as string))}><Link2 aria-hidden /> Make a link for Members</Button>}
        </form>
        {link && <p className="mt-3 text-sm">Send this link yourself, or copy it for later: <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invitation link" className={`${PHONE_FIELD} mt-2 block max-w-xl font-mono sm:w-full`} /></p>}
        <p className="mt-4 text-sm font-medium">What each role may do</p>
        <dl className="mt-1 space-y-1 text-sm">
          {WORKSPACE_ROLE_ORDER.map((r) => <div key={r} className="flex flex-wrap gap-x-2"><dt className="w-full shrink-0 font-medium sm:w-16">{WORKSPACE_ROLE_WORDS[r].label}</dt><dd className="text-muted-foreground">{WORKSPACE_ROLE_WORDS[r].line}</dd></div>)}
        </dl>
      </section>

      {data.isOwner && !data.trial.onTrial && (
        <section aria-labelledby="team-domain">
          <h3 id="team-domain" className="text-base font-medium">Colleagues at your company</h3>
          <label className="mt-2 flex min-h-11 items-center gap-3 text-sm sm:min-h-0 sm:gap-2">
            <input type="checkbox" checked={Boolean(data.domain.on)} disabled={pending || (!data.domain.on && !domainOffer)} onChange={(e) => run(() => setDomainJoining(e.target.checked))} className="size-5 shrink-0 accent-[var(--color-ink)] sm:size-4" />
            {data.domain.on ? `People with an address at ${data.domain.on} may ask to join` : domainOffer ? `Let people with an address at ${domainOffer} ask to join` : "Domain Joining needs a verified company address, not a public mail provider"}
          </label>
          <p className="mt-1 text-sm text-muted-foreground">Each one still waits for you or an Admin to let them in.</p>
        </section>
      )}

      <section aria-labelledby="team-groups">
        <h3 id="team-groups" className="text-base font-medium">A first Group</h3>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">A Group is a part of your team, such as Finance. Share with it or ask it a question, and whoever joins it later is included. Optional.</p>
        {data.groups.map((g) => (
          <fieldset key={g.id} className="mb-3 text-sm">
            <legend className="font-medium">{g.name}</legend>
            <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
              {candidates.filter((p) => p.kind === "member").map((p) => (
                <label key={p.id} className="flex min-h-11 items-center gap-3 sm:min-h-0 sm:gap-1.5"><input type="checkbox" checked={g.members.includes(p.id)} disabled={pending} onChange={(e) => run(() => setMember(g.id, p.id, e.target.checked))} className="size-5 shrink-0 accent-[var(--color-ink)] sm:size-4" />{p.name}</label>
              ))}
            </div>
          </fieldset>
        ))}
        <form className="flex max-w-sm flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(async () => createGroup(group), () => setGroup("")); }}>
          <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Finance" aria-label="New Group name" className="h-11 text-base sm:h-9 sm:text-sm" />
          <Button type="submit" variant="outline" className={PHONE_BUTTON} disabled={pending || !group.trim()}>Add Group</Button>
        </form>
      </section>

      <section aria-labelledby="team-asks">
        <h3 id="team-asks" className="text-base font-medium">Who is asked for what</h3>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Each Metric needs someone who sends its values. Pressing a name asks that person for the Metric: they get a first request by the way they prefer. Nothing is assigned until you press.</p>
        {data.asks.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have no Metric yet that you can change. Make one in the Starting point or First Metric step, then come back.</p>
        ) : (
          <ul className="space-y-3">
            {data.asks.map((a) => {
              const free = candidates.filter((p) => !a.submitters.some((s) => s.id === p.id) && !a.suggested.some((s) => s.id === p.id));
              return (
                <li key={a.metricId} className="stock rounded-[var(--radius-card)] p-4 text-sm sm:p-3">
                  <p className="font-medium">{a.name}</p>
                  <p className="text-muted-foreground">{a.submitters.length ? `Asked: ${a.submitters.map((s) => s.name).join(", ")}` : "Nobody is asked yet."}</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    {a.suggested.map((s) => <Button key={s.id} size="sm" variant="outline" className={`${PHONE_BUTTON_SM} h-auto min-h-11 whitespace-normal py-2 sm:h-auto sm:min-h-8 sm:py-1`} disabled={pending} onClick={() => ask(a.metricId, s.id)} aria-label={`Ask ${s.name} for ${a.name}`}>Suggested: {s.name} ({s.function})</Button>)}
                    {free.length > 0 && (
                      <>
                        <select aria-label={`Ask someone else for ${a.name}`} value={other[a.metricId] ?? ""} onChange={(e) => setOther({ ...other, [a.metricId]: e.target.value })} className={PHONE_FIELD}>
                          <option value="">Ask someone else…</option>
                          {free.map((p) => <option key={p.id} value={p.id}>{p.name}{p.kind === "contact" ? " (Contact)" : ""}</option>)}
                        </select>
                        <Button size="sm" variant="outline" className={PHONE_BUTTON_SM} disabled={pending || !other[a.metricId]} onClick={() => ask(a.metricId, other[a.metricId], () => setOther({ ...other, [a.metricId]: "" }))}>Ask</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="border-t border-border pt-4">
        <p role="alert" className="min-h-5 text-sm text-destructive">{error}</p>
        <div className={`mt-2 ${PHONE_FOOTER}`}>
          <Button type="button" variant="ghost" className={PHONE_BUTTON} disabled={pending} onClick={() => run(() => skipStep("team"), () => router.push("/"))}>Skip</Button>
          <Button type="button" className={PHONE_BUTTON} disabled={pending} onClick={() => router.push("/")}>Go to Ziffr</Button>
        </div>
      </footer>
    </div>
  );
}
