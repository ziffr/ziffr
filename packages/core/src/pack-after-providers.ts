// After a Pack's set-up: "Choose who provides them" (spec 0068, #1345; GLOSSARY: Pack, Submitter, Contact, Source,
// Workflow). The numbers the set-up made that nobody provides get the people chosen: each follows the first Workflow the
// set-up made (of its line, else of the Pack), else one for its period, and the ways a person answers are opened for it,
// as the set-up does for a person named there. Nobody who provides a number already is changed.
// Security: only Owners and Admins, and only Metrics they own. The people are found and checked as at set-up
// (pack-start-plan.ts): a new person becomes a Contact, none gets a role. Every change goes through the operation used by
// hand (addContact, setMetricWorkflow, setMetricSources, addSubmitters), so their checks, limits and Audit Log lines
// apply. Nothing is sent: whoever was named is asked from the Workflow's next run. A browser names only the people.
import { Refused, type Actor } from "./actor";
import { db } from "./db";
import { ASK_NOBODY } from "./first-steps-value";
import { mailOn } from "./mail";
import { addSubmitters, setMetricSources } from "./metrics";
import { assertStillOpen, packAfter, type AfterMetric, type PackAfter } from "./pack-after";
import { OPENED_SOURCES, setupPeople, unsubscribedNote } from "./pack-setup-build";
import { addContacts, cleanPerson, contactRoom, contextOf, nextRun, roomOf } from "./pack-start";
import { planProviders, type StartPickable } from "./pack-start-plan";
import { START_PROVIDERS_MAX } from "./pack-start-steps";
import { askingFor, joinPeriodWorkflows } from "./period-workflows";
import type { WorkflowConfig } from "./types";
import { openWorkflowRows } from "./workflow-rows";
import { setMetricWorkflow, workflowSchedule } from "./workflows";

/** The numbers a person may choose providers for here: their own, which take values and nobody submits. */
export const unprovided = (a: PackAfter): AfterMetric[] => a.metrics.filter((m) => m.provided && m.mine && !a.submitters.some((s) => s.metric === m.id));

type OwnFlow = { id: number; name: string; config: WorkflowConfig };

// The Workflows the set-up made that are the person's own, in the order they were made: nobody's Metric joins a
// Workflow someone else decides the Approvers of.
async function ownFlows(actor: Actor, ids: number[]): Promise<OwnFlow[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from("workflows").select("id, name, config").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).in("id", ids).order("id");
  if (error) throw new Error("The Workflows could not be read.");
  return (await openWorkflowRows(actor.workspaceId, data)).map((w) => ({ id: Number(w.id), name: String(w.name), config: w.config as WorkflowConfig }));
}

/** Which Workflow of the set-up a Metric joins: of its line, else of the whole Pack; null where it made none. */
function flowFor(a: PackAfter, flows: OwnFlow[], m: AfterMetric): OwnFlow | null {
  const made = a.made.filter((x) => x.kind === "workflow");
  const own = (x: (typeof made)[number] | undefined) => flows.find((f) => f.id === x?.id) ?? null;
  const line = m.line && made.find((x) => x.line?.repeat === m.line!.repeat && x.line.name === m.line!.name && own(x));
  return own(line || made.find((x) => x.line === null && own(x)));
}

const flowsOf = (actor: Actor, a: PackAfter) => ownFlows(actor, a.made.filter((x) => x.kind === "workflow").map((x) => x.id));

/** What choosing providers offers. */
export type PackProviders = {
  pack: string;
  /** The numbers nobody provides. `workflow`: the one each joins, by name, where it follows none yet. `opens`: the web
   * form, email, Slack and Telegram are opened for it. */
  numbers: { id: number; name: string; workflow: string | null; opens: boolean }[];
  me: { id: string; name: string };
  people: StartPickable[];
  practice: boolean;
  trial: boolean;
  max: number;
  mail: boolean;
};

/** What "Choose who provides them" shows (Owners and Admins). Writes nothing. */
export async function packProviders(actor: Actor, installId: number): Promise<PackProviders> {
  const a = await packAfter(actor, installId);
  const [flows, people, room, mail] = await Promise.all([flowsOf(actor, a), setupPeople(actor), roomOf(actor, 0), mailOn()]);
  const me = people.get(actor.personId)!;
  return {
    pack: a.name,
    numbers: unprovided(a).map((m) => ({
      id: m.id, name: m.name, opens: !m.metric.sources.includes("web_form"),
      workflow: m.workflowId ? null : flowFor(a, flows, m)?.name ?? askingFor(m.metric.period).name,
    })),
    me: { id: me.id, name: me.name },
    people: [...people.values()].filter((p) => p.id !== actor.personId),
    practice: room.practice, trial: room.trial !== null, max: START_PROVIDERS_MAX, mail,
  };
}

/** What choosing providers did. */
export type PackProvidersSet = {
  numbers: number;
  /** Who is asked now, and the day of the next run that asks them. */
  asked: { id: string; name: string; you: boolean; from: string | null }[];
  /** Whether someone here may be invited, by its own button. None was sent. */
  invite: boolean;
  notes: string[];
};

// Puts the Metrics that follow no Workflow into one, before anyone submits them: stopped half way, they still read as
// provided by nobody, so pressing again finishes them.
async function joinFlows(actor: Actor, a: PackAfter, flows: OwnFlow[], todo: AfterMetric[]) {
  const without = todo.filter((m) => !m.workflowId);
  const byPeriod: number[] = [];
  for (const m of without) {
    const flow = flowFor(a, flows, m);
    if (flow) await setMetricWorkflow(actor, m.id, flow.id);
    else byPeriod.push(m.id);
  }
  await joinPeriodWorkflows(actor, byPeriod);
}

// The day each Metric is next asked for, by the Workflow it follows now.
async function askedFrom(actor: Actor, ids: number[]): Promise<string | null> {
  const ws = actor.workspaceId;
  const { data: metrics, error } = await db().from("metrics").select("workflow_id").eq("workspace_id", ws).in("id", ids);
  const flows = [...new Set((metrics ?? []).flatMap((m) => (m.workflow_id === null ? [] : [Number(m.workflow_id)])))];
  const { data, error: unread } = await db().from("workflows").select("id, config").eq("workspace_id", ws).in("id", flows);
  if (error || unread) throw new Error("The Workflows could not be read.");
  const clock = await workflowSchedule(actor);
  return (await openWorkflowRows(ws, data)).map((w) => nextRun(w.config as WorkflowConfig, clock)).sort()[0] ?? null;
}

/** Makes the chosen people (up to five others, and the person themself) the Submitters of every number this set-up made
 * that nobody provides. `providers` is a browser's: its shape, size and every person are checked here. */
export async function setPackProviders(actor: Actor, installId: number, providers: unknown): Promise<PackProvidersSet> {
  const a = await packAfter(actor, installId);
  await assertStillOpen(actor);
  if (!Array.isArray(providers) || providers.length > START_PROVIDERS_MAX + 1) throw new Refused("Say who provides these numbers.");
  const choices = { providers: providers.map(cleanPerson) };
  const todo = unprovided(a);
  if (!todo.length) throw new Refused("Somebody provides each of these numbers already. Change it on a Metric's page.");
  const plan = planProviders(await roomOf(actor, 0), await contextOf(actor, choices), choices.providers);
  const why = plan.problems[0] ?? (await contactRoom(actor, plan.contacts.length));
  if (why) throw new Refused(why);

  const ids = await addContacts(actor, plan, choices, []);
  const people = plan.providers.map((ref) => ids.get(ref) ?? ref);
  await joinFlows(actor, a, await flowsOf(actor, a), todo);
  for (const m of todo) {
    // Sources first: someone asked for a number must have a way to answer.
    if (!m.metric.sources.includes("web_form")) await setMetricSources(actor, m.id, [...new Set([...m.metric.sources, ...OPENED_SOURCES])]);
    await addSubmitters(actor, m.id, people, ASK_NOBODY);
  }
  const [from, named] = await Promise.all([askedFrom(actor, todo.map((m) => m.id)), setupPeople(actor)]);
  const stopped = await unsubscribedNote(actor, { metrics: [{ submitters: people }], people: named });
  return {
    numbers: todo.length,
    asked: people.map((id) => ({ id, name: named.get(id)?.name ?? "Someone", you: id === actor.personId, from })),
    invite: plan.invite.length > 0,
    notes: stopped ? [stopped] : [],
  };
}
