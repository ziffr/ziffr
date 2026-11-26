// The Setup Guide's Team step through the core (spec 0052, ticket 10; GLOSSARY: Setup Guide, Invitation, Domain Joining,
// Group, Contact, Submitter, Business Function, Trial Workspace). One read for Owners and Admins that gathers what the
// step shows: who is in, the invitations waiting, whether the trial lets anyone be invited now, Domain Joining, the Groups
// and, for the Metrics the person may change, who is asked and who might be, as suggestions only. Every change is made
// by the operations that already exist (invitations, Groups, Submitters); nothing here writes. Visibility is the point:
// a Business Function is read through `businessFunctions`, which only Owners and Admins pass, so nobody else ever
// receives one, and a Metric appears only when the actor may change who submits to it.
import type { Actor } from "./actor";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { peopleIn } from "./submissions";
import { getGroups, getShares, visibilityOfMany } from "./access";
import { getMetrics } from "./workspace-data";
import { openRows } from "./sealed-columns";
import { businessFunctions } from "./business-function";
import { openInvitations } from "./invitations";
import { mailOn } from "./mail";
import { trialEndsAt } from "./trials";
import { inviteGate, type InviteGate } from "./invite-gate";
import { BUSINESS_FUNCTION_LABELS, isBusinessFunction, type BusinessFunction } from "@ziffr/pack/business-functions";

/** How many Metrics "Who is asked for what" lists: the newest ones the person may change. The Metrics page has the rest. */
export const ASKS_SHOWN = 10;

/** A person of the Workspace as the step lists them. `function` is the person's Business Function, which only an Owner or
 * Admin is given (the loader refuses everyone else), in words, or null when they gave none. */
export type TeamPerson = { id: string; name: string; kind: "member" | "contact"; role: string | null; function: string | null };

/** One Metric and who is asked for it. `suggested` are people whose function matches the audience of the Pack the Metric
 * came from: a suggestion only, nothing is assigned until someone presses it. */
export type TeamAsk = {
  metricId: number; name: string; submitters: { id: string; name: string }[]; suggested: { id: string; name: string; function: string }[];
  /** Set where the actor is the Metric's Editor, not its owner: the only people they may ask for it, those who see it. */
  limited?: string[];
};

/** What the Team step shows an Owner or Admin. */
export type TeamSetup = {
  isOwner: boolean;
  /** Whether this Ziffr emails invitations: where it does not, the step says the link is sent by hand. */
  mailOn: boolean;
  people: TeamPerson[];
  invitations: { id: number; email: string | null; role: string; expiresAt: string }[];
  trial: { onTrial: boolean };
  /** Whether anyone can be invited now, and if not, why and what opens it. */
  gate: InviteGate;
  domain: { on: string | null };
  groups: { id: number; name: string; members: string[] }[];
  asks: TeamAsk[];
};

/** The people whose function is on the list, in the order given: the suggestion for one Metric. Pure; a person with no
 * function is never suggested, and an empty list suggests nobody. */
export function suggestPeople<T extends { id: string; function: BusinessFunction | null }>(audienceFunctions: readonly BusinessFunction[] | undefined, people: readonly T[]): T[] {
  if (!audienceFunctions?.length) return [];
  return people.filter((p) => p.function !== null && audienceFunctions.includes(p.function));
}

/** The Team step's data for an Owner or Admin. A Member, a Guest, an Access Key and the demo are refused: the step is
 * theirs to see only as Owners and Admins, and it carries Business Functions. */
export async function teamSetup(actor: Actor): Promise<TeamSetup> {
  if (actor.key || actor.workspaceId === DEMO_WORKSPACE_ID || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden();
  const ws = actor.workspaceId;
  const [gate, people, functionRows, invitations, mail, ends, { data: roles }, { data: space }, groups, shares, { data: rows }, { data: installs }] = await Promise.all([
    inviteGate(actor),
    peopleIn(ws),
    businessFunctions(actor),
    openInvitations(actor),
    mailOn(),
    trialEndsAt(ws),
    db().from("memberships").select("user_id, role").eq("workspace_id", ws),
    db().from("workspaces").select("join_domain").eq("id", ws).single(),
    getGroups(ws),
    getShares(ws),
    db().from("metrics").select("id, name, owner_id, formula").eq("workspace_id", ws).is("archived_at", null).order("id", { ascending: false }).limit(60),
    db().from("pack_installs").select("id, manifest").eq("workspace_id", ws),
  ]);
  const roleOf = new Map((roles ?? []).map((r) => [r.user_id as string, r.role as string]));
  const fnOf = new Map(functionRows.map((f) => [f.personId, f.function]));
  const listed = people.filter((p) => p.contact || roleOf.get(p.id) !== "guest");
  const team: (TeamPerson & { key: BusinessFunction | null })[] = listed.map((p) => {
    const key = p.contact ? null : fnOf.get(p.id) ?? null;
    return { id: p.id, name: p.name, kind: p.contact ? "contact" : "member", role: p.contact ? null : roleOf.get(p.id) ?? null, function: key ? BUSINESS_FUNCTION_LABELS[key] : null, key };
  });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  // The Metrics the actor may change who submits to: their own, and those they are an Editor of.
  const editable = (await openRows("metrics", ws, (rows ?? []).filter((m) => !m.formula && (m.owner_id === actor.personId || shares.some((s) => s.object_type === "metric" && s.object_id === m.id && s.user_id === actor.personId && s.role === "editor"))))).slice(0, ASKS_SHOWN);
  const ids = editable.map((m) => m.id as number);
  const [{ data: tokens }, { data: catalog }] = ids.length
    ? await Promise.all([
        db().from("tokens").select("metric_id, submitter_id").eq("workspace_id", ws).in("metric_id", ids).is("stands_in_for", null),
        db().from("catalog_metrics").select("name, pack_install_id").eq("workspace_id", ws).not("pack_install_id", "is", null),
      ])
    : [{ data: [] }, { data: [] }];
  const audienceOfInstall = new Map((installs ?? []).map((i) => [i.id as number, ((i.manifest as { audience?: { functions?: unknown } } | null)?.audience?.functions ?? []) as unknown[]]));
  // A Metric is matched to the Pack it came from by the name of the entry it was made from; one renamed since matches no Pack, so it is not suggested for.
  const functionsOfName = new Map<string, BusinessFunction[]>();
  for (const c of catalog ?? []) {
    const list = (audienceOfInstall.get(c.pack_install_id as number) ?? []).filter(isBusinessFunction);
    if (list.length) functionsOfName.set(String(c.name), [...(functionsOfName.get(String(c.name)) ?? []), ...list]);
  }
  // An Editor adds only people who see the Metric already (addSubmitters), so only they are offered.
  const sees = editable.some((m) => m.owner_id !== actor.personId) ? await visibilityOfMany(ws, await getMetrics(ws)) : null;
  const asks: TeamAsk[] = editable.map((m) => {
    const may = m.owner_id === actor.personId ? null : team.filter((p) => sees!(p.id).metrics.has(m.id as number)).map((p) => p.id);
    const submitting = new Set((tokens ?? []).filter((t) => t.metric_id === m.id).map((t) => t.submitter_id as string));
    const suggested = suggestPeople(functionsOfName.get(String(m.name)), team.filter((p) => p.kind === "member" && !submitting.has(p.id) && (!may || may.includes(p.id))).map((p) => ({ ...p, function: p.key })));
    return {
      metricId: m.id as number, name: String(m.name),
      submitters: [...submitting].map((id) => ({ id, name: nameOf.get(id) ?? "Someone" })),
      suggested: suggested.map((p) => ({ id: p.id, name: p.name, function: BUSINESS_FUNCTION_LABELS[p.function!] })),
      ...(may ? { limited: may } : {}),
    };
  });

  return {
    isOwner: actor.role === "owner",
    mailOn: mail,
    people: team.map((p) => ({ id: p.id, name: p.name, kind: p.kind, role: p.role, function: p.function })),
    invitations: invitations.filter((i) => !i.held_at).map((i) => ({ id: i.id as number, email: (i.email as string | null) ?? null, role: String(i.role), expiresAt: String(i.expires_at) })),
    trial: { onTrial: ends !== null },
    gate,
    domain: { on: (space?.join_domain as string | null) ?? null },
    groups: groups.filter((g) => !g.everyone).map((g) => ({ id: g.id, name: g.name, members: g.members })),
    asks,
  };
}
