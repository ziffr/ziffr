// After a Pack's set-up: the first number and the invitations (spec 0068, #1345; GLOSSARY: Pack, Invitation, Contact,
// Guest, Submitter, Trial Workspace). Where a trial's invitations wait for the Owner's own value, the Owner sends one of
// the numbers made, through the same intake as First Steps and the Record a value form. Invitations go only by their
// own button, one for each person ticked, through inviteByEmail.
// Security: only Owners and Admins (pack-after.ts). Nothing is loosened: who may grant what, the trial's people, the
// invitations a day and the Contact rules are inviteByEmail's and the database's, and each refusal is handed back beside
// its person. A browser names ids and a typed number; the role and the address are the server's, and only a Contact this
// set-up names now may be invited from here. A number is sent without any message, and who was not a Submitter before is
// not one afterwards. What comes back holds names the person may see and, once, the link of an invitation they just made
// that was not emailed; never an address.
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { linkTo } from "./deliveries";
import { ASK_NOBODY } from "./first-steps-value";
import { yearStartFor } from "./fiscal-year";
import { inviteGate, type InviteGate } from "./invite-gate";
import { inviteByEmail } from "./invitations";
import { mailOn, type MailTransport } from "./mail";
import { addSubmitters, removeSubmitters } from "./metrics";
import { assertStillOpen, packAfter, type AfterMetric, type PackAfter } from "./pack-after";
import { wordsForPeople } from "./pack-setup";
import { setupPeople } from "./pack-setup-build";
import { recordedHolders } from "./pack-setup-record";
import { periodLabel, periodStart } from "./periods";
import { isPracticeWorkspace } from "./practice";
import { recordOwnValue } from "./record-own-value";
import { peopleIn } from "./submissions";
import { trialLimitsInEffect } from "./trial-limits-in-effect";
import { trialEndsAt } from "./trials";

/** A number the person may type as their first: its name, unit and the period it would be for. */
export type PackFirstNumber = { id: number; name: string; unit: string; period: string };
/** Someone this set-up names who is not in Ziffr yet: the role their invitation would give, and whether it can go. */
export type PackInvitee = { id: string; name: string; role: "member" | "guest"; state: "open" | "invited" | "noAddress" };

/** What the invitations of a set-up stand at. */
export type PackInvite = {
  pack: string;
  /** Set while a trial's invitations wait for an Owner's first value; `you` when this person can send it. */
  first: { you: boolean; numbers: PackFirstNumber[] } | null;
  /** Why nobody can be invited now (other than the wait for a first value), in words. */
  closed: string | null;
  people: PackInvitee[];
  /** In a trial, the places still free for people. */
  places: number | null;
  /** Whether email is set up; without it the person sends each link themselves. */
  mail: boolean;
};

// The numbers the person may type: made here, typed by people, theirs to change, and open to the web form.
const typable = (a: PackAfter): AfterMetric[] => {
  const mine = (m: AfterMetric) => a.submitters.some((s) => s.metric === m.id);
  return a.metrics.filter((m) => m.provided && m.edits && m.metric.sources.includes("web_form")).sort((x, y) => Number(mine(y)) - Number(mine(x)));
};

async function firstNumbers(actor: Actor, a: PackAfter): Promise<PackFirstNumber[]> {
  return Promise.all(typable(a).map(async (m) => {
    const period = m.metric.period;
    const ys = await yearStartFor(actor.workspaceId, period);
    return { id: m.id, name: m.name, unit: m.metric.unit ?? "", period: periodLabel(periodStart(new Date(), period, ys), period, ys) };
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
  const [gate, people, practice, trial, mail] = await Promise.all([inviteGate(actor), packInvitees(actor, a), isPracticeWorkspace(ws), trialEndsAt(ws), mailOn()]);
  let places: number | null = null;
  if (trial) {
    const [limits, { data: taken, error }] = await Promise.all([trialLimitsInEffect(), db().rpc("trial_people", { p_workspace: ws })]);
    if (error) throw new Error("The trial's places could not be counted.");
    places = Math.max(0, limits.people - Number(taken));
  }
  return {
    pack: a.name,
    first: gate.state === "waiting" ? { you: gate.you, numbers: gate.you ? await firstNumbers(actor, a) : [] } : null,
    closed: closedWords(gate, practice), people, places, mail,
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
  const metric = typable(a).find((m) => m.id === metricId);
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
