// First Steps, "Who provides this number from now on?" and the closing screen (spec 0067, ticket 4; GLOSSARY: First
// Steps, Submitter, Contact, Invitation, Workflow, Asking Schedule, Trial Workspace). The Owner chooses once for all the
// Metrics First Steps made: themself, a colleague, or nobody for now. One operation writes it, through the same
// operations the app uses (addContact, inviteByEmail, addSubmitters, setMetricWorkflow), so their checks, limits and
// Audit Log lines apply. It loosens none of them and sends no request for a value. In a trial a colleague opens only
// after the Owner's own value, and is invited as a Guest, the least that can send values.
// Visibility is the product: only the Owner of a Workspace First Steps made gets an answer. It holds names the Owner may
// see and, once, the link of an invitation they just made that was not emailed; no address but the one they typed.
import { Refused, type Actor } from "./actor";
import { askingHour, addDaysTo, nextAskingDay, nextAskingRun } from "./asking-schedule";
import { db } from "./db";
import { linkTo } from "./deliveries";
import { yearStartFor } from "./fiscal-year";
import { assertFirstSteps, ASK_NOBODY, firstStepsGuide, firstStepsProgress, madeMetrics, sentByPeople, type MadeMetric } from "./first-steps-value";
import { colleagueWords, contactName, nameList, whenWords, type ColleagueState } from "./first-steps-words";
import { inviteGate, ownerOrAdminHasOwnValue } from "./invite-gate";
import { inviteByEmail, revokeInvitation } from "./invitations";
import { isAddress, type MailTransport } from "./mail";
import { addSubmitters, removeSubmitters } from "./metrics";
import { askingFor, joinPeriodWorkflows } from "./period-workflows";
import { peopleIn } from "./submissions";
import { addContact, removeContact } from "./team";
import { trialEndsAt } from "./trials";
import type { AskingSchedule, WorkflowConfig } from "./types";
import { whatWorksHere } from "./what-works-here";
import { openWorkflowRows } from "./workflow-rows";
import { workingPeriod } from "./workflow-rules";
import { setMetricWorkflow } from "./workflows";
import { localTime, workspaceClock } from "./workspace-clock";
import { workspaceName } from "./workspace-settings";

const PROVIDER_CHOICES = ["me", "colleague", "nobody"] as const;
/** Who provides the numbers from now on. */
export type ProviderChoice = (typeof PROVIDER_CHOICES)[number];

async function workflowsOf(actor: Actor) {
  const { data, error } = await db().from("workflows").select("id, config").eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The Workflows could not be read.");
  return (await openWorkflowRows(actor.workspaceId, data)).map((w) => ({ id: w.id as number, config: w.config as WorkflowConfig }));
}

// The first day and hour Ziffr asks for any of these Metrics, in words: by each one's Workflow, or by the one it would
// join. A day whose period already has its value asks for nothing, so it is passed over.
async function firstAsk(actor: Actor, metrics: MadeMetric[], now = new Date()): Promise<string | null> {
  const [{ timeZone, runHour }, flows] = await Promise.all([workspaceClock(actor), workflowsOf(actor)]);
  const local = localTime(now, timeZone);
  const found: { day: string; hour: number }[] = [];
  for (const m of metrics) {
    const own = flows.find((w) => w.id === m.workflowId)?.config;
    const asking: AskingSchedule = own?.asking ?? { hour: null, days: own ? { kind: "every_day" } : askingFor(m.period).days };
    const yearStart = await yearStartFor(actor.workspaceId, m.period);
    let day = nextAskingRun(asking, runHour, local);
    for (let tries = 0; day && tries < 40; tries++) {
      const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("metric_id", m.id).eq("period_start", workingPeriod(day, m.period, yearStart));
      if (!count) break;
      day = nextAskingDay(asking.days, addDaysTo(day, 1));
    }
    if (day) found.push({ day, hour: askingHour(asking, runHour) });
  }
  const first = found.sort((a, b) => a.day.localeCompare(b.day) || a.hour - b.hour)[0];
  return first ? whenWords(first.day, first.hour) : null;
}

/** What the "who provides" screen shows. */
export type FirstSenderView = {
  /** More than one Metric: "these numbers". */
  several: boolean;
  /** "Just me" answered the first question: the colleague is "Someone else". */
  alone: boolean;
  /** A trial where invitations wait for the Owner's first value, so a colleague cannot be chosen yet. */
  locked: boolean;
  trial: boolean;
  /** Whether email is really sent here. */
  mailReal: boolean;
  /** When Ziffr first asks, in words, if anybody is to be asked. */
  firstAsk: string | null;
};

/** The "who provides" screen. */
export async function firstStepsSender(actor: Actor): Promise<FirstSenderView> {
  await assertFirstSteps(actor);
  const guide = await firstStepsGuide(actor);
  const metrics = (await madeMetrics(actor, guide.chosenAt)).filter(sentByPeople);
  const [gate, ends, here, space, when] = await Promise.all([
    inviteGate(actor), trialEndsAt(actor.workspaceId), whatWorksHere(actor),
    db().from("workspaces").select("used_by").eq("id", actor.workspaceId).single(),
    firstAsk(actor, metrics),
  ]);
  return {
    several: metrics.length > 1, alone: space.data?.used_by === "me", locked: gate.state === "waiting", trial: Boolean(ends),
    mailReal: here.find((w) => w.way === "email")?.state === "real", firstAsk: when,
  };
}

// The choice from untrusted input: one of the three, and for a colleague an address mail can go to, in lower case.
function checkProviderChoice(input: unknown): { choice: "me" | "nobody" } | { choice: "colleague"; email: string } {
  const raw = (input && typeof input === "object" ? input : {}) as { choice?: unknown; email?: unknown };
  const choice = PROVIDER_CHOICES.find((c) => c === raw.choice);
  if (!choice) throw new Refused("Pick one of the choices.");
  if (choice !== "colleague") return { choice };
  const email = typeof raw.email === "string" && raw.email.length <= 320 ? raw.email.trim().toLowerCase() : "";
  if (email.length > 254 || !isAddress(email)) throw new Refused("Enter a valid email address.");
  return { choice, email };
}

// The Contacts First Steps added itself: only these may a choice made again take back.
async function addedContacts(ws: string): Promise<string[]> {
  const { data, error } = await db().from("setup_guides").select("first_steps_contacts").eq("workspace_id", ws).single();
  if (error) throw new Error("The earlier choice could not be read.");
  return data.first_steps_contacts as string[];
}

async function keepAddedContacts(ws: string, ids: string[]): Promise<void> {
  const { error } = await db().from("setup_guides").update({ first_steps_contacts: ids, updated_at: new Date().toISOString() }).eq("workspace_id", ws);
  if (error) throw new Error("Your choice could not be saved.");
}

// A new Contact, noted as added here. One that cannot be noted is removed again, so none is left that is never taken back.
async function addNotedContact(actor: Actor, name: string, email: string): Promise<string> {
  const id = await addContact(actor, { name, email });
  try {
    await keepAddedContacts(actor.workspaceId, [...(await addedContacts(actor.workspaceId)), id]);
  } catch (e) {
    await removeContact(actor, id);
    throw e;
  }
  return id;
}

// Whether this Owner's invitation to the address already went out since First Steps began: choosing another colleague
// and then this one again must not email them each time.
async function emailedBefore(actor: Actor, email: string, since: string): Promise<boolean> {
  const { count, error } = await db().from("invitations").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("created_by", actor.personId).eq("email", email).gte("created_at", since).gt("email_sends", 0).is("email_error", null);
  if (error) throw new Error("The invitations could not be read.");
  return Boolean(count);
}

const NOT_AGAIN = "Ziffr emailed them an invitation before and sends no second one. That link no longer works: send them this one.";

type Colleague = { id: string; name: string; state: ColleagueState; note: string | null; link: string | null };

// The colleague with this address: a Member or Contact who is there already, else a new Contact. In a trial a Contact is
// reached by nothing until they accept, so one invitation as a Guest is made, tied to the Contact so their Tokens move to
// them. Refused, a new Contact is removed again and nothing else has changed. An address Ziffr emailed here before gets
// no second email: the Owner is given the new link. `since`: when First Steps began.
async function colleagueFor(actor: Actor, email: string, since: string, transport?: MailTransport): Promise<Colleague> {
  const ws = actor.workspaceId;
  const known = (await peopleIn(ws, { contactDetails: true })).find((p) => p.email?.toLowerCase() === email);
  const name = known?.name ?? contactName(email);
  const id = known?.id ?? (await addNotedContact(actor, name, email));
  const [trial, here] = await Promise.all([trialEndsAt(ws), whatWorksHere(actor)]);
  const found = { id, name, note: null, link: null };
  if (!trial || (known && !known.contact)) return { ...found, state: here.find((w) => w.way === "email")?.state === "real" ? "asked" : "outbox" };
  const { count, error } = await db().from("invitations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("contact_person_id", id).is("revoked_at", null).is("accepted_at", null).is("held_at", null).gt("expires_at", new Date().toISOString());
  if (error) throw new Error("The invitations could not be read.");
  if (count) return { ...found, state: "waiting" };
  let made: { token: string; emailed: boolean };
  const again = await emailedBefore(actor, email, since);
  try {
    made = await inviteByEmail(actor, { email, role: "guest", contactPersonId: id }, transport, !again);
  } catch (e) {
    if (!known) await removeContact(actor, id);
    throw e;
  }
  if (made.emailed) return { ...found, state: "invited" };
  const { data } = await db().from("invitations").select("email_error").eq("workspace_id", ws).eq("token", made.token).maybeSingle();
  return { ...found, state: "link", note: again ? NOT_AGAIN : ((data?.email_error as string | null) ?? null), link: linkTo(`/invite/${made.token}`) };
}

// A choice made again takes an earlier colleague back, so a mistyped address is not asked: only a Contact First Steps
// added itself and who never sent a value. Their invitation is revoked and, if nothing else names them, the Contact
// removed. Members, accepted invitations and Contacts added any other way are never touched.
async function takeBackTyped(actor: Actor, metrics: MadeMetric[], keep: string | null): Promise<void> {
  const ws = actor.workspaceId;
  const added = await addedContacts(ws);
  const taken: string[] = [];
  for (const id of added.filter((c) => c !== keep)) {
    const [tokens, values] = await Promise.all([
      db().from("tokens").select("metric_id").eq("workspace_id", ws).eq("submitter_id", id).is("stands_in_for", null).in("metric_id", metrics.map((m) => m.id)),
      db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("submitter_id", id),
    ]);
    if (tokens.error || values.error) throw new Error("The earlier choice could not be read.");
    if (!tokens.data.length || values.count) continue;
    for (const t of tokens.data) await removeSubmitters(actor, t.metric_id as number, [id]);
    const { data: open } = await db().from("invitations").select("id").eq("workspace_id", ws).eq("contact_person_id", id).is("revoked_at", null).is("accepted_at", null);
    for (const i of open ?? []) await revokeInvitation(actor, i.id as number);
    const named = await Promise.all((["submitter_id", "stand_in_id"] as const).map((column) => db().from("tokens").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq(column, id)));
    if (named.every((n) => n.count === 0)) await removeContact(actor, id);
    taken.push(id);
  }
  if (taken.length) await keepAddedContacts(ws, added.filter((c) => !taken.includes(c)));
}

/** What choosing did: the choice as it was taken (the Owner's own address means "me"), and for a colleague what to tell
 * the Owner, with the invitation's link when they have to send it themselves. */
export type ProvidersChosen = { choice: ProviderChoice; lines: string[]; link: string | null };

/** Sets who provides the made Metrics' values from now on, and records that it was chosen. Nothing is asked now: the
 * Workflow asks from its next run. "me": the Owner submits each Metric people send; "colleague": the colleague does, in
 * the Owner's place; both put a Metric without a Workflow into one for its period. "nobody": the Metrics leave their
 * Workflows and the Owner stays able to type values. Choosing again is safe. */
export async function chooseProviders(actor: Actor, input: unknown, transport?: MailTransport): Promise<ProvidersChosen> {
  await assertFirstSteps(actor);
  const wanted = checkProviderChoice(input);
  const guide = await firstStepsGuide(actor);
  // Chosen again, it covers the Metrics of the first time: not ones made by hand long after.
  const made = await madeMetrics(actor, guide.chosenAt);
  if (!made.length) throw new Refused("Add a metric first.");
  const sent = made.filter(sentByPeople);
  let choice: ProviderChoice = wanted.choice;
  let colleague: Colleague | null = null;
  if (wanted.choice === "colleague") {
    if ((await inviteGate(actor)).state === "waiting") throw new Refused("Send your first value first. Then you can ask a colleague.");
    if (!sent.length) throw new Refused("None of these numbers is sent in by a person.");
    const { data: me, error } = await db().from("profiles").select("email").eq("id", actor.personId).single();
    if (error) throw new Error("Your profile could not be read.");
    if (String(me.email ?? "").toLowerCase() === wanted.email) choice = "me";
    else colleague = await colleagueFor(actor, wanted.email, guide.firstStepsAt, transport);
    if (colleague?.id === actor.personId) { colleague = null; choice = "me"; }
  }
  if (guide.chosenAt) await takeBackTyped(actor, made, colleague?.id ?? null);
  for (const m of sent) {
    // The new Submitter first, so a failure half way never leaves a Metric with nobody.
    await addSubmitters(actor, m.id, [colleague?.id ?? actor.personId], ASK_NOBODY);
    if (colleague) await removeSubmitters(actor, m.id, [actor.personId]);
  }
  if (choice === "nobody") {
    for (const m of made) if (m.workflowId !== null) await setMetricWorkflow(actor, m.id, null);
  } else {
    await joinPeriodWorkflows(actor, sent.map((m) => m.id));
  }
  if (!guide.chosenAt) {
    const { error } = await db().from("setup_guides").update({ providers_chosen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("workspace_id", actor.workspaceId);
    if (error) throw new Error("Your choice could not be saved.");
  }
  if (!colleague) return { choice, lines: [], link: null };
  const when = colleague.state === "asked" ? await firstAsk(actor, await madeMetrics(actor, guide.chosenAt).then((all) => all.filter(sentByPeople))) : null;
  return { choice, lines: colleagueWords({ state: colleague.state, name: colleague.name, when, note: colleague.note }), link: colleague.link };
}

/** What the closing screen shows. */
export type FirstStepsDone = {
  workspace: string;
  /** The ready-made set's name, when one was used. */
  set: string | null;
  metrics: string[];
  /** The Owner's own first value, or null while it is not in. */
  value: { metric: string; value: string; period: string } | null;
  /** Whether that value is still missing: "One thing is still open". */
  open: boolean;
  /** Who is asked for values, in words. */
  asked: string;
  /** A trial where invitations wait for the Owner's first value. */
  invitesLocked: boolean;
  /** The dashboard to open, or null when there is none. */
  dashboard: number | null;
};

// Who is asked on a schedule, in words: the Submitters of the made Metrics that have a Workflow. Programs (Feeds) are
// never asked. In a trial a Contact is asked only once they accept.
async function askedWords(actor: Actor, made: MadeMetric[], chosen: boolean): Promise<string> {
  if (!chosen) return "Nobody yet";
  const ids = made.filter((m) => m.workflowId !== null).map((m) => m.id);
  const { data: tokens, error } = ids.length ? await db().from("tokens").select("submitter_id").eq("workspace_id", actor.workspaceId).in("metric_id", ids).is("stands_in_for", null) : { data: [], error: null };
  if (error) throw new Error("First Steps could not be read.");
  const asked = new Set((tokens ?? []).map((t) => t.submitter_id as string));
  const [people, ends] = await Promise.all([peopleIn(actor.workspaceId), trialEndsAt(actor.workspaceId)]);
  const others = people.filter((p) => p.id !== actor.personId && asked.has(p.id)).map((p) => (ends && p.contact ? `${p.name} (once they accept)` : p.name));
  return nameList([...(asked.has(actor.personId) ? ["You"] : []), ...others]) || "Nobody for now";
}

/** The closing screen: what was set up, from what the Workspace holds, and what is still open. */
export async function firstStepsDone(actor: Actor): Promise<FirstStepsDone> {
  await assertFirstSteps(actor);
  const ws = actor.workspaceId;
  const guide = await firstStepsGuide(actor);
  const made = await madeMetrics(actor);
  const [name, own, gate, install, board, asked] = await Promise.all([
    workspaceName(actor), ownerOrAdminHasOwnValue(ws), inviteGate(actor),
    db().from("pack_installs").select("manifest").eq("workspace_id", ws).order("id").limit(1).maybeSingle(),
    db().from("dashboards").select("id").eq("workspace_id", ws).eq("owner_id", actor.personId).order("id").limit(1).maybeSingle(),
    askedWords(actor, made, Boolean(guide.chosenAt)),
  ]);
  if (install.error || board.error) throw new Error("First Steps could not be read.");
  const { value } = own ? await firstStepsProgress(actor) : { value: null };
  return {
    workspace: name,
    set: (install.data?.manifest as { name?: string } | null)?.name ?? null,
    metrics: made.map((m) => m.name),
    value: value ? { metric: value.metric, value: value.value, period: value.period } : null,
    open: !own,
    asked,
    invitesLocked: gate.state === "waiting",
    dashboard: (board.data?.id as number | undefined) ?? null,
  };
}
