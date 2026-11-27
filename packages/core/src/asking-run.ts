// One run's asking (spec 0064; GLOSSARY: Combined Prompt, Prompt, Delivery). A run is one call of the Workflows job for a
// Workspace, Run workflows by hand, Ask for missing values or one Set up from a Pack. It collects what it would ask, and
// at its end sends one message per person and way; a reminder lists everything still missing. Off while the switch is off
// (combined-switch.ts): then there is no run, and every figure is sent at once in a message of its own.
import { db } from "./db";
import { combinedPromptsOn } from "./combined-switch";
import { combinedChunks } from "./combined-words";
import { answerSourceFor, deliverPrompt, insertDelivery, insertPromptRow, sendSingle, type Asking } from "./deliveries";
import { storeCombinedWords } from "./internal/combined-delivery";
import { initialDeliveryState, sendQueuedNow } from "./outbound";
import { openWorkflowRows } from "./workflow-rows";
import { dueDate } from "./workflow-rules";
import { shiftPeriod } from "./periods";
import { DEMO_WORKSPACE_ID } from "./team";
import type { ConnectorId } from "./connectors/index";
import type { Period, WorkflowConfig } from "./types";

/** One piece of a run (a Metric's turn): `into` collects what it asks, and `done` takes what may only happen once the
 * messages of everyone asked in this piece exist, so that a run that fails half way loses nobody. */
export type AskingStep = { into?: (asking: Asking) => void; done: (then: () => Promise<unknown>) => Promise<void> };

/** A run that combines. */
export type AskingRun = {
  step: () => AskingStep;
  /** Called when `flush` could not make every message. */
  onFailure: (then: () => PromiseLike<unknown>) => void;
  /** Makes the messages of everything collected, person by person, then does what waited for them. Throws when a person's
   * messages could not all be made; the others are unharmed. */
  flush: () => Promise<void>;
};

const AT_ONCE: AskingStep = { done: async (then) => { await then(); } };

/** A piece of this run; with no run, everything happens at once. */
export const stepOf = (run: AskingRun | null | undefined): AskingStep => run?.step() ?? AT_ONCE;

/** Starts a run of one Workspace as of a day, or null where Prompts are not combined. The demo never combines. */
export function startAsking(workspaceId: string, asOf: string): AskingRun | null {
  if (!combinedPromptsOn() || workspaceId === DEMO_WORKSPACE_ID) return null;
  let collected: Asking[] = [];
  let waiting: { people: string[]; then: () => Promise<unknown> }[] = [];
  let failures: (() => PromiseLike<unknown>)[] = [];
  return {
    step() {
      const people = new Set<string>();
      return {
        into: (a) => {
          if (a.workspaceId !== workspaceId) throw new Error("Nothing is combined across Workspaces.");
          people.add(a.person.id);
          collected.push(a);
        },
        done: async (then) => { waiting.push({ people: [...people], then }); },
      };
    },
    onFailure(then) { failures.push(then); },
    async flush() {
      const [asked, after, onFailed] = [collected, waiting, failures];
      collected = [];
      waiting = [];
      failures = [];
      const failed = new Set<string>();
      let first: unknown;
      for (const id of new Set(asked.map((a) => a.person.id))) {
        try {
          await askPerson(workspaceId, asOf, asked.filter((a) => a.person.id === id));
        } catch (e) {
          failed.add(id);
          first ??= e;
        }
      }
      for (const w of after) if (!w.people.some((p) => failed.has(p))) await w.then();
      if (!failed.size) return;
      for (const f of onFailed) await f();
      throw first;
    },
  };
}

/** What makes two askings the same figure: the Metric, the period and whose value it is. */
const figureKey = (metricId: number, period: string, whose: string) => `${metricId}|${period}|${whose}`;
const keyOf = (a: Asking) => figureKey(a.metric.id, a.period, a.standsInFor ?? a.person.id);

/** One person's messages for one run. */
async function askPerson(ws: string, asOf: string, asked: Asking[]): Promise<void> {
  // A figure asked twice in one run is listed once; asked anew, it goes by all its ways.
  const unique = new Map<string, Asking>();
  for (const a of asked) if (!unique.has(keyOf(a)) || !a.reminder) unique.set(keyOf(a), a);
  // Those with a Remind step today come first.
  const figures = [...unique.values()].sort((a, b) => Number(b.reminder) - Number(a.reminder));
  if (asked.some((a) => a.reminder)) figures.push(...(await stillMissing(ws, asOf, asked[0], new Set(unique.keys()))));
  const flows = await workflowsOf(ws, figures.map((a) => a.metric.id));
  const rows: (Asking & { promptId: number; due: string | null })[] = [];
  for (const a of figures) {
    const promptId = await insertPromptRow(a);
    if (!promptId) throw new Error("A Prompt could not be made.");
    const flow = flows.get(a.metric.id);
    rows.push({ ...a, promptId, due: flow ? dueDate(a.period, flow.period, flow.config) : null });
  }
  for (const via of new Set(rows.flatMap((r) => r.routes.map((x) => x.via)))) {
    const here = rows.flatMap((r) => {
      const route = r.routes.find((x) => x.via === via);
      return route ? [{ ...r, route, form: r.metric.sources.includes("web_form") }] : [];
    });
    for (const chunk of combinedChunks(via, here)) {
      // One figure is worded and sent as it always was.
      if (chunk.length === 1) await sendSingle(chunk[0], chunk[0].promptId, chunk[0].route);
      else await sendCombined(ws, via, chunk);
    }
  }
}

type Figure = Asking & { promptId: number; due: string | null; route: Asking["routes"][number] };

/** One Combined Prompt. It is filled in while it only sits in the Outbox, and queued once its list and words are there,
 * so the sending job never takes half a message; one that could not be filled in is removed. */
async function sendCombined(ws: string, via: ConnectorId, figures: Figure[]): Promise<void> {
  const person = figures[0].person.id;
  // The Outbox names a sender only when every figure comes from the same one; otherwise Ziffr sends it.
  const senderId = figures.every((f) => f.senderId === figures[0].senderId) ? figures[0].senderId : null;
  const mailState = await initialDeliveryState(via, ws, person);
  const d = await insertDelivery(ws, { connector: via, recipient_id: person, sender_id: senderId, kind: "prompt", combined: true, subject: "Your numbers", body: "Your numbers", mail_state: "outbox" }, "prompt", mailState);
  if (!d.id) throw new Error("A message could not be made.");
  try {
    const { error } = await db().from("delivery_prompts").insert(figures.map((f, ord) => ({
      workspace_id: ws, delivery_id: d.id, prompt_id: f.promptId, metric_id: f.metric.id, token_id: f.tokenId, ord,
      answer_source: answerSourceFor(f.route), reply_here: f.route.answerHere, still_missing: f.reminder, due_date: f.due,
    })));
    if (error) throw new Error("A message's figures could not be listed.");
    // One that only stays in the Outbox is never "sent": its numbers are fixed here.
    await storeCombinedWords(ws, d.id, mailState === "outbox");
    if (mailState !== "outbox") {
      const { error: notQueued } = await db().from("deliveries").update({ mail_state: mailState }).eq("id", d.id).eq("workspace_id", ws);
      if (notQueued) throw new Error("A message could not be queued.");
    }
  } catch (e) {
    await db().from("deliveries").delete().eq("id", d.id).eq("workspace_id", ws);
    throw e;
  }
  if (figures.every((f) => !f.queue) && !d.held) await sendQueuedNow(d.id, mailState, via);
}

/** The Workflow of each of these Metrics that has one and is still asked for (not Derived, not Archived). */
async function workflowsOf(ws: string, metricIds: number[]) {
  const [{ data: metrics }, { data: sealed }] = await Promise.all([
    db().from("metrics").select("id, period, formula, archived_at, workflow_id").eq("workspace_id", ws).in("id", metricIds).not("workflow_id", "is", null),
    db().from("workflows").select("id, owner_id, config").eq("workspace_id", ws),
  ]);
  const flows = await openWorkflowRows(ws, sealed);
  return new Map((metrics ?? []).flatMap((m) => {
    const flow = flows.find((w) => w.id === m.workflow_id);
    return flow && !m.formula && !m.archived_at ? [[m.id as number, { period: m.period as Period, ownerId: flow.owner_id as string, config: flow.config as WorkflowConfig }] as const] : [];
  }));
}

/** The other figures a person's reminder lists: everything Ziffr asked them for before that is still missing and due (the
 * Due Date has come, or the first day its Workflow reminds on). Each is asked again as a reminder, by its first way. */
async function stillMissing(ws: string, asOf: string, like: Asking, have: Set<string>): Promise<Asking[]> {
  const person = like.person.id;
  const { data: open } = await db().from("prompts").select("metric_id, period_start, stands_in_for").eq("workspace_id", ws).eq("submitter_id", person).is("answered_at", null).order("id", { ascending: false }).limit(500);
  const candidates = new Map<string, { metricId: number; period: string; standsInFor: string | null }>();
  for (const p of open ?? []) {
    const key = figureKey(p.metric_id as number, p.period_start as string, (p.stands_in_for as string | null) ?? person);
    if (!have.has(key)) candidates.set(key, { metricId: p.metric_id as number, period: p.period_start as string, standsInFor: p.stands_in_for as string | null });
  }
  if (!candidates.size) return [];
  const ids = [...new Set([...candidates.values()].map((c) => c.metricId))];
  const [flows, { data: tokens }, { data: away }] = await Promise.all([
    workflowsOf(ws, ids),
    db().from("tokens").select("metric_id, stand_in_id").eq("workspace_id", ws).eq("submitter_id", person).is("stands_in_for", null).in("metric_id", ids),
    db().from("away").select("user_id").eq("user_id", person).lte("starts", asOf).gte("ends", asOf),
  ]);
  const out: Asking[] = [];
  for (const c of candidates.values()) {
    const flow = flows.get(c.metricId);
    if (!flow) continue;
    const due = dueDate(c.period, flow.period, flow.config);
    const early = Math.max(0, ...flow.config.steps.map((s) => (s.type === "remind" ? s.daysBefore : 0)));
    if (asOf < shiftPeriod(due, "day", -early)) continue;
    // Their own figure only while they hold their own Token, and not while their Stand-in is asked in their place.
    const own = tokens?.find((t) => t.metric_id === c.metricId);
    if (!c.standsInFor && (!own || (away?.length && own.stand_in_id))) continue;
    const [{ data: values }, { data: state }] = await Promise.all([
      db().from("observations").select("id").eq("workspace_id", ws).eq("metric_id", c.metricId).eq("period_start", c.period).limit(1),
      db().from("period_states").select("state").eq("workspace_id", ws).eq("metric_id", c.metricId).eq("period_start", c.period).maybeSingle(),
    ]);
    if (values?.length || (state && state.state !== "asked")) continue;
    await deliverPrompt({ metricId: c.metricId, submitterId: person, senderId: flow.ownerId, period: c.period, queue: like.queue, note: `Reminder, due ${due}.`, reminder: true, quietly: true, standingInFor: c.standsInFor ?? undefined, into: (a) => out.push(a) });
  }
  return out;
}
