// Questions and tasks (GLOSSARY: Action, Question, Task, Thread, Delivery Preference): asking about a value or assigning
// work on it, replying in its Thread, closing it, and where each person hears about it. Every function takes the Actor
// first and works only inside the actor's Workspace.
import { MAX_PROMPT_WAYS } from "./prompt-route";
import { remindDueTasks } from "./scheduled-runs";
import { format } from "date-fns";
import { db } from "./db";
import { insertSealed } from "./sealed-columns";
import { assertCan, Forbidden, type Actor } from "./actor";
import { assertMembersIn, assertSeesMetrics } from "./sharing";
import { deliver, deliverPrompt } from "./deliveries";
import { finishTask, postReply } from "./threads";
import { changeActionState } from "./action-state";
import { FROM_APP, type ChangeSource } from "./webhook-events";
import { DEMO_WORKSPACE_ID } from "./team";
import { CONNECTOR_IDS, type ConnectorId, type PreferenceKind } from "./connectors/index";
import type { ActionKind, Period } from "./types";
import { periodStart } from "./periods";
import { yearStartFor } from "./fiscal-year";
import { DemoReadOnly } from "./demo";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: PreferenceKind[] = ["question", "task", "reminder", "update"];

/** A question or task as asked: about which value, of whom, and how. */
export type AskInput = {
  metricId: number; period: string; assigneeId: string; kind?: ActionKind; text: string;
  due?: string | null; breakdownLabel?: string | null; via?: ConnectorId | null; readGroupId?: number | null;
};

/** Asks a member about a value of a Metric the actor sees, or assigns them a task on it. Returns the Action's id. */
export async function ask(actor: Actor, input: AskInput): Promise<number> {
  const kind: ActionKind = input.kind ?? "question";
  if (kind !== "question" && kind !== "task") throw new Forbidden();
  if (!DAY.test(String(input.period))) throw new Forbidden();
  if (input.due && !DAY.test(String(input.due))) throw new Error("Pick a due date.");
  const text = String(input.text ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("Write the question first.");
  await assertSeesMetrics(actor, [Number(input.metricId)]);
  await assertMembersIn(actor, [String(input.assigneeId)]);
  const ws = actor.workspaceId;
  const { data: obs } = await db().from("observations").select("id").eq("metric_id", input.metricId).eq("period_start", input.period).eq("workspace_id", ws).order("created_at", { ascending: false }).limit(1);
  const group = input.readGroupId ? (await db().from("groups").select("id").eq("id", input.readGroupId).eq("workspace_id", ws).maybeSingle()).data : null;
  const [data] = await insertSealed("actions", ws, [{
    metric_id: input.metricId, period_start: input.period, observation_id: obs?.[0]?.id ?? null, asker_id: actor.personId,
    assignee_id: input.assigneeId, question: text, kind, due_date: input.due || null,
    breakdown_label: input.breakdownLabel ? String(input.breakdownLabel).slice(0, 200) : null,
    read_group_id: group ? input.readGroupId : null,
  }]).catch((e) => { throw e instanceof DemoReadOnly ? e : new Error("The question could not be sent."); }) as { id: number }[];
  // The assignee hears it where they want to, or where the asker chose for this one message.
  const via = input.via && CONNECTOR_IDS.includes(input.via) ? input.via : null;
  await deliver({ kind, actionId: data.id, senderId: actor.personId, recipientId: input.assigneeId, via });
  return data.id;
}

/** Replies in an Action's Thread; only the people on it may. A "Correction: …" line proposes a new value. */
export async function reply(actor: Actor, actionId: number, body: string, correction: number | null, source: ChangeSource = FROM_APP, commands = true) {
  const value = correction === null || correction === undefined || !Number.isFinite(Number(correction)) ? null : Number(correction);
  await postReply(actor.workspaceId, Number(actionId), actor.personId, String(body ?? "").trim().slice(0, 5000), value, source, commands);
}

/** The asker closes or reopens an Action. Never a Self-check: its submitter is its asker too, and one closed by hand
 * would leave the value waiting; reopened, it would decide nothing. Confirm or Correct decide it. An open Approval is
 * not closed by hand either (#444): its Approver could no longer decide it, so the value would wait for good. */
export async function setActionStatus(actor: Actor, actionId: number, status: "open" | "closed", source: ChangeSource = FROM_APP) {
  if (status !== "open" && status !== "closed") throw new Forbidden();
  if (status === "closed") {
    const { data: a } = await db().from("actions").select("purpose, status").eq("id", Number(actionId)).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (a?.purpose === "approval" && a.status === "open") throw new Error("An Approval is closed by deciding it: approve it or send it back.");
  }
  const r = await changeActionState(actor.workspaceId, Number(actionId), { to: status, from: status === "closed" ? ["open", "answered"] : ["answered", "closed"], guard: { askerId: actor.personId, purpose: "not_self_check" } }, source);
  if (r.refused) throw new Forbidden();
  if (!r.changed) return;
  if (status === "closed") {
    const { data } = await db().from("actions").select("assignee_id").eq("id", actionId).eq("workspace_id", actor.workspaceId).maybeSingle();
    if (data) await deliver({ kind: "closed", actionId, senderId: actor.personId, recipientId: data.assignee_id });
  }
}

/** The assignee marks their open task done, with an optional note (at most 2,000 characters) kept as the Thread's last reply. */
export async function markTaskDone(actor: Actor, actionId: number, source: ChangeSource = FROM_APP, note?: string | null) {
  if (!(await finishTask(actor.workspaceId, Number(actionId), actor.personId, source, note))) throw new Error("That task is not open, or it is not yours.");
}

/** Where a person hears about each kind of message. A person sets their own; the team default (personId null) is
 * set by owners and admins. A null or empty choice removes the preference, so the team's applies. Prompts (kind
 * "reminder") take a list of ways in order, each once: the Prompt goes by all of them and only the first sends
 * reminders; every other kind has one way. */
export async function setPreference(actor: Actor, personId: string | null, kind: PreferenceKind, connector: ConnectorId | ConnectorId[] | null) {
  const ways = connector === null ? [] : Array.isArray(connector) ? connector : [connector];
  const valid = ways.every((c) => CONNECTOR_IDS.includes(c)) && new Set(ways).size === ways.length && ways.length <= (kind === "reminder" ? MAX_PROMPT_WAYS : 1);
  if (!KINDS.includes(kind) || !valid) throw new Forbidden();
  if (personId === null) {
    assertCan(actor, "manage-members");
    if (!ways.length) throw new Forbidden();
  } else if (personId !== actor.personId) throw new Forbidden();
  const ws = actor.workspaceId;
  if (personId === null) await db().from("delivery_preferences").delete().is("user_id", null).eq("kind", kind).eq("workspace_id", ws);
  else await db().from("delivery_preferences").delete().eq("user_id", personId).eq("kind", kind).eq("workspace_id", ws);
  if (ways.length) {
    const { error } = await db().from("delivery_preferences").insert(ways.map((c, position) => ({ user_id: personId, kind, connector: c, position, workspace_id: ws })));
    if (error) throw new Error("Your choice could not be saved. Try again.");
  }
}

/** Starting the scheduled run by hand messages the whole workspace: outside the demo only Owners and Admins may. */
function assertRunsNow(actor: Actor): void {
  assertCan(actor, "create");
  if (actor.workspaceId !== DEMO_WORKSPACE_ID && actor.role !== "owner" && actor.role !== "admin") throw new Forbidden();
}

/** Reminds assignees of open tasks due within two days, now (the scheduled run does this each morning, spec 0005); the
 * emails are queued for the deliveries job.
 * Returns how many. */
export async function sendDueReminders(actor: Actor): Promise<number> {
  assertRunsNow(actor);
  return remindDueTasks(actor.workspaceId, format(new Date(), "yyyy-MM-dd"));
}

/** What a scheduler would do each period: ask every submitter whose value for the current period is missing.
 * Their emails are queued for the deliveries job. Returns how many were asked. */
export async function askForMissingValues(actor: Actor): Promise<number> {
  assertRunsNow(actor);
  const ws = actor.workspaceId;
  const [{ data: tokens }, { data: metrics }] = await Promise.all([
    db().from("tokens").select("metric_id, submitter_id").eq("workspace_id", ws).is("stands_in_for", null),
    db().from("metrics").select("id, period, formula, archived_at").eq("workspace_id", ws),
  ]);
  const byId = new Map((metrics ?? []).map((m) => [m.id as number, m]));
  // Whether a Metric has its value for the current period, asked once per Metric rather than once per submitter.
  const has = new Map<number, Promise<boolean>>();
  const hasValue = (id: number, period: string) => {
    if (!has.has(id)) has.set(id, Promise.resolve(db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", id).eq("period_start", period)).then((r) => Boolean(r.count)));
    return has.get(id)!;
  };
  let n = 0;
  for (const t of tokens ?? []) {
    const m = byId.get(t.metric_id);
    if (!m || m.formula || m.archived_at) continue; // computed, or archived: never asked for
    const period = periodStart(new Date(), m.period as Period, await yearStartFor(actor.workspaceId, m.period as Period));
    const [have, { count: asked }] = await Promise.all([
      hasValue(m.id, period),
      db().from("prompts").select("id", { count: "exact", head: true }).eq("metric_id", m.id).eq("submitter_id", t.submitter_id).eq("period_start", period).is("answered_at", null).gte("sent_at", format(new Date(), "yyyy-MM-dd")),
    ]);
    if (have || asked) continue; // already there, or already asked today
    // Queued: the deliveries job sends them, so asking many people never waits on the mail server.
    if (await deliverPrompt({ metricId: m.id, submitterId: t.submitter_id, senderId: actor.personId, queue: true })) n++;
  }
  return n;
}
