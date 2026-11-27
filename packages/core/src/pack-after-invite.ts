// After a Pack's set-up: the first number and the invitations (spec 0068, #1345; GLOSSARY: Pack, Invitation, Contact,
// Guest, Submitter, Self-check, Trial Workspace). Where a trial's invitations wait for the Owner's own value, the Owner
// sends one of the numbers made, through the same intake as First Steps and the Record a value form: one they send
// themselves or that nobody provides yet, and a colleague's only where there is no such one, saying whose it becomes.
// A value that then waits for their own Self-check is confirmed on the same screen; invitations open with the value,
// checked or not. Invitations go only by their own button, one for each person ticked, through inviteByEmail.
// Security: only Owners and Admins (pack-after.ts). Nothing is loosened: who may grant what, the trial's people, the
// invitations a day and the Contact rules are inviteByEmail's and the database's, and each refusal is handed back beside
// its person. A browser names ids and a typed number; the role and the address are the server's, and only a Contact this
// set-up names now may be invited from here. A number is sent without any message, and who was not a Submitter before is
// not one afterwards. Only the person's own open Self-check on a Metric made here is shown and confirmed, through
// confirmOwnValue. What comes back holds names and values the person may see and, once, the link of an invitation they
// just made that was not emailed; never an address.
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { linkTo } from "./deliveries";
import { ASK_NOBODY } from "./first-steps-value";
import { yearStartFor } from "./fiscal-year";
import { formatValue } from "./format";
import { inviteGate, type InviteGate } from "./invite-gate";
import { inviteByEmail } from "./invitations";
import { mailOn, type MailTransport } from "./mail";
import { addSubmitters, removeSubmitters } from "./metrics";
import { assertStillOpen, packAfter, type AfterMetric, type PackAfter } from "./pack-after";
import { unprovided } from "./pack-after-providers";
import { listed } from "./pack-places";
import { wordsForPeople } from "./pack-setup";
import { setupPeople } from "./pack-setup-build";
import { recordedHolders } from "./pack-setup-record";
import { periodLabel, periodStart } from "./periods";
import { isPracticeWorkspace } from "./practice";
import { recordOwnValue } from "./record-own-value";
import { openRows } from "./sealed-columns";
import { peopleIn } from "./submissions";
import { trialLimitsInEffect } from "./trial-limits-in-effect";
import { trialEndsAt } from "./trials";
import type { Period } from "./types";
import { confirmOwnValue } from "./workflows";
import { numberStyleOf } from "./workspace-settings";

/** A number the person may type as their first: its name, unit and the period it would be for. `whose` names the
 * colleagues who send it, when it is theirs: the value typed counts as their number. */
export type PackFirstNumber = { id: number; name: string; unit: string; period: string; whose: string | null };
/** A value of the person's own that waits for their Self-check, on a Metric the set-up made. */
export type PackCheck = { actionId: number; metric: string; value: string; period: string };
/** Someone this set-up names who is not in Ziffr yet: the role their invitation would give, and whether it can go. */
export type PackInvitee = { id: string; name: string; role: "member" | "guest"; state: "open" | "invited" | "noAddress" };

/** What the invitations of a set-up stand at. */
export type PackInvite = {
  pack: string;
  /** Set while a trial's invitations wait for an Owner's first value; `you` when this person can send it. `choose`:
   * some numbers here have nobody yet, whom the person may choose (themself, to type one). */
  first: { you: boolean; numbers: PackFirstNumber[]; choose: boolean } | null;
  /** This person's values here that wait for their own check. */
  checks: PackCheck[];
  /** Why nobody can be invited now (other than the wait for a first value), in words. */
  closed: string | null;
  people: PackInvitee[];
  /** In a trial, the places still free for people. */
  places: number | null;
  /** Whether email is set up; without it the person sends each link themselves. */
  mail: boolean;
};

// The numbers the person may type: made here, typed by people, theirs to change, and open to the web form; of those
// the ones they send themselves, then those nobody provides. Only where there is none of either, colleagues' numbers.
function typable(actor: Actor, a: PackAfter): { metric: AfterMetric; others: string[] }[] {
  const all = a.metrics.filter((m) => m.provided && m.edits && m.metric.sources.includes("web_form"))
    .map((metric) => ({ metric, senders: a.submitters.filter((s) => s.metric === metric.id).map((s) => s.person) }));
  const mine = all.filter((x) => x.senders.includes(actor.personId));
  const own = [...mine, ...all.filter((x) => !x.senders.length)];
  return own.length ? own.map((x) => ({ metric: x.metric, others: [] })) : all.map((x) => ({ metric: x.metric, others: x.senders }));
}

async function periodWords(ws: string, period: Period, start: string): Promise<string> {
  return periodLabel(start, period, await yearStartFor(ws, period));
}

async function firstNumbers(actor: Actor, a: PackAfter): Promise<PackFirstNumber[]> {
  const offered = typable(actor, a);
  const people = offered.some((x) => x.others.length) ? await setupPeople(actor) : null;
  return Promise.all(offered.map(async ({ metric: m, others }) => {
    const period = m.metric.period;
    const start = periodStart(new Date(), period, await yearStartFor(actor.workspaceId, period));
    const names = others.map((id) => people?.get(id)?.name ?? "someone else");
    return { id: m.id, name: m.name, unit: m.metric.unit ?? "", period: await periodWords(actor.workspaceId, period, start), whose: names.length ? listed(names) : null };
  }));
}

/** The person's own open Self-checks on the Metrics made here, each with the value it is about. */
async function ownChecks(actor: Actor, a: PackAfter): Promise<PackCheck[]> {
  const ws = actor.workspaceId;
  const ids = a.metrics.map((m) => m.id);
  if (!ids.length) return [];
  const { data, error } = await db().from("actions").select("id, metric_id, period_start, observation_id").eq("workspace_id", ws).eq("purpose", "self_check").eq("status", "open").eq("assignee_id", actor.personId).in("metric_id", ids).order("id");
  if (error) throw new Error("What waits for your check could not be read.");
  if (!data.length) return [];
  const { data: rows, error: unread } = await db().from("observations").select("id, value, value_sealed").eq("workspace_id", ws).in("id", data.flatMap((t) => (t.observation_id === null ? [] : [Number(t.observation_id)])));
  if (unread) throw new Error("What waits for your check could not be read.");
  const values = new Map((await openRows("observations", ws, rows as Record<string, unknown>[])).map((o) => [Number(o.id), o.value]));
  const style = await numberStyleOf(ws);
  return Promise.all(data.flatMap((t) => {
    const m = a.metrics.find((x) => x.id === Number(t.metric_id));
    const value = values.get(Number(t.observation_id));
    // A value that does not open is not shown as 0: the task stays in Actions.
    if (!m || typeof value !== "number") return [];
    return [periodWords(ws, m.metric.period, String(t.period_start)).then((period) => ({ actionId: Number(t.id), metric: m.name, value: formatValue(m.metric, value, style), period }))];
  }));
}

/** The Contacts this set-up names: those a Position is held for are invited as Members; in a trial, where nothing
 * reaches a Contact, those who provide or stand in for its numbers as Guests. */
export async function packInvitees(actor: Actor, a: PackAfter): Promise<PackInvitee[]> {
  const ws = actor.workspaceId;
  if (await isPracticeWorkspace(ws)) return [];
  const [holders, trial, { data: contacts, error }] = await Promise.all([
    recordedHolders(actor, a.setups), trialEndsAt(ws), db().from("contacts").select("person_id").eq("workspace_id", ws),
  ]);
  if (error) throw new Error("The Contacts could not be read.");
  const isContact = new Set((contacts ?? []).map((c) => c.person_id as string));
  const roles = new Map<string, "member" | "guest">();
  for (const s of trial ? a.submitters : []) for (const id of [s.person, s.standIn]) if (id && isContact.has(id)) roles.set(id, "guest");
  // A role wins over Guest.
  for (const h of holders) if (h.heldFor && isContact.has(h.heldFor)) roles.set(h.heldFor, "member");
  if (!roles.size) return [];
  const ids = [...roles.keys()];
  const [people, addresses, { data: open, error: unread }] = await Promise.all([
    setupPeople(actor), peopleIn(ws, { contactDetails: true }),
    db().from("invitations").select("contact_person_id").eq("workspace_id", ws).in("contact_person_id", ids).is("revoked_at", null).is("accepted_at", null).is("held_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  if (unread) throw new Error("The invitations could not be read.");
  const waiting = new Set((open ?? []).map((i) => i.contact_person_id as string));
  const mailed = new Set(addresses.filter((p) => p.email).map((p) => p.id));
  return ids.flatMap((id): PackInvitee[] => {
    const who = people.get(id);
    return who ? [{ id, name: who.name, role: roles.get(id)!, state: waiting.has(id) ? "invited" : mailed.has(id) ? "open" : "noAddress" }] : [];
  }).sort((x, y) => Number(x.role === "guest") - Number(y.role === "guest") || x.name.localeCompare(y.name));
}

function closedWords(gate: InviteGate, practice: boolean): string | null {
  if (practice) return "A Practice Workspace invites nobody.";
  if (gate.state === "ended") return "This trial has ended: nobody can be invited.";
  if (gate.state === "full") return `Your trial holds ${gate.limit} people, and every place is taken.`;
  return null;
}

/** Where the invitations of a Pack's set-up stand (Owners and Admins). Writes nothing. */
export async function packInvite(actor: Actor, installId: number): Promise<PackInvite> {
  const a = await packAfter(actor, installId);
  const ws = actor.workspaceId;
  const [gate, people, practice, trial, mail, checks] = await Promise.all([inviteGate(actor), packInvitees(actor, a), isPracticeWorkspace(ws), trialEndsAt(ws), mailOn(), ownChecks(actor, a)]);
  let places: number | null = null;
  if (trial) {
    const [limits, { data: taken, error }] = await Promise.all([trialLimitsInEffect(), db().rpc("trial_people", { p_workspace: ws })]);
    if (error) throw new Error("The trial's places could not be counted.");
    places = Math.max(0, limits.people - Number(taken));
  }
  return {
    pack: a.name,
    first: gate.state === "waiting" ? { you: gate.you, numbers: gate.you ? await firstNumbers(actor, a) : [], choose: unprovided(a).length > 0 } : null,
    checks, closed: closedWords(gate, practice), people, places, mail,
  };
}

/** The Owner's first number, typed after the set-up while a trial's invitations wait for it: they are made its
 * Submitter without any message, the value goes through the web form's intake, and who was not a Submitter before is
 * not one afterwards. The Metric id and the text are a browser's: the Metric must be one this set-up offers. */
export async function sendFirstPackNumber(actor: Actor, installId: number, metricId: unknown, text: unknown): Promise<{ ok: boolean; detail: string }> {
  const a = await packAfter(actor, installId);
  await assertStillOpen(actor);
  const gate = await inviteGate(actor);
  if (gate.state !== "waiting" || !gate.you) throw new Refused("A first number is not needed from you here. Reload this page.");
  const metric = typable(actor, a).find((x) => x.metric.id === metricId)?.metric;
  if (!metric) throw new Forbidden("Pick one of the numbers this set-up made.");
  if (typeof text !== "string" || !text.trim() || text.length > 40) throw new Refused("Type a number.");
  const had = a.submitters.some((s) => s.metric === metric.id && s.person === actor.personId);
  if (!had) await addSubmitters(actor, metric.id, [actor.personId], ASK_NOBODY);
  try {
    const result = await recordOwnValue(actor, metric.id, { value: text });
    return { ok: result.ok, detail: result.detail };
  } finally {
    if (!had) await removeSubmitters(actor, metric.id, [actor.personId]);
  }
}

/** "Yes, it is right": confirms the person's own Self-check of a value on a Metric this set-up made, as on the task
 * itself. Answers what became of the value. */
export async function confirmPackNumber(actor: Actor, installId: number, actionId: unknown): Promise<{ words: string }> {
  const a = await packAfter(actor, installId);
  await assertStillOpen(actor);
  const check = (await ownChecks(actor, a)).find((c) => c.actionId === actionId);
  if (!check) throw new Forbidden("This check is not yours, or it is done. Reload this page.");
  return { words: await confirmOwnValue(actor, check.actionId) };
}

/** What became of one person's invitation. */
export type PackInvited = { id: string; name: string; state: "emailed" | "link" | "already" | "refused"; words: string; link: string | null };

const IDS_MAX = 250;

async function inviteOne(actor: Actor, who: PackInvitee, email: string, transport?: MailTransport): Promise<PackInvited> {
  const one = { id: who.id, name: who.name, link: null };
  try {
    const made = await inviteByEmail(actor, { email, role: who.role, contactPersonId: who.id }, transport);
    if (made.emailed) return { ...one, state: "emailed", words: "Invitation sent." };
    const { data } = await db().from("invitations").select("email_error").eq("workspace_id", actor.workspaceId).eq("token", made.token).maybeSingle();
    return { ...one, state: "link", words: `${(data?.email_error as string | null) ?? "Not emailed."} Send them this link.`, link: linkTo(`/invite/${made.token}`) };
  } catch (e) {
    const why = wordsForPeople(e);
    if (!why) console.error("An invitation from a Pack's set-up failed:", e);
    return { ...one, state: "refused", words: why ?? "Not invited: something unexpected happened. Try again." };
  }
}

/** Invites the ticked people of a set-up (Owners and Admins), one invitation each, tied to the Contact, so that what
 * they were named for moves to them when they accept. Members first, so that a trial's last places go to whoever needs a
 * role. Answers for each one what happened; a person invited already is not invited again. */
export async function invitePackPeople(actor: Actor, installId: number, personIds: unknown, transport?: MailTransport): Promise<PackInvited[]> {
  const a = await packAfter(actor, installId);
  if (!Array.isArray(personIds) || !personIds.length || personIds.length > IDS_MAX || !personIds.every((x) => typeof x === "string" && x.length <= 64)) throw new Refused("Pick whom to invite.");
  const people = await packInvitees(actor, a);
  const wanted = new Set(personIds as string[]);
  if ([...wanted].some((id) => !people.some((p) => p.id === id))) throw new Forbidden("Invite only people this set-up names. Reload this page.");
  const addresses = new Map((await peopleIn(actor.workspaceId, { contactDetails: true })).map((p) => [p.id, p.email]));
  const out: PackInvited[] = [];
  for (const who of people.filter((p) => wanted.has(p.id))) {
    const email = addresses.get(who.id);
    if (who.state === "invited") out.push({ id: who.id, name: who.name, state: "already", words: "Invited already, and not joined yet.", link: null });
    else if (!email) out.push({ id: who.id, name: who.name, state: "refused", words: "No email address. Add one on the Members page.", link: null });
    else out.push(await inviteOne(actor, who, email, transport));
  }
  return out;
}
