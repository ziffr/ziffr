// Workflows for programs and assistants (GLOSSARY: Workflow, Approver, Self-check, Tell, Access Key; ticket #433). A key
// with "workflows:write" makes, changes and deletes the Workflows its creator owns, steps included, through the very
// functions the Workflow editor uses (workflows.ts), so the same cleaning, limits and history hold. A key acts only for
// its creator: another person's Workflow, or one of another Workspace, answers like one that does not exist (Forbidden,
// so the API says 404). Who approves (an Approve step: its Approvers, which values wait, what happens when nobody else
// could approve), who a Tell step tells and who a Checklist Item goes to are a person's decision: only a program's key that also holds
// "workflows:people" may change them, never an assistant (not offered, refused where a connection is made, and a check
// in the database); any other key sends those steps back exactly as it read them, or leaves them out when making a
// Workflow. Deleting a Workflow that has such a step needs the same scope, since it would drop the Approvals. A Send Snapshot step
// is no program's to read or change at all (spec 0045): steps a key sends keep the stored one as it is.
// The Asking Schedule (spec 0035, when the Workflow asks: an hour and the days) is a field of the Workflow like the
// others and is checked by the same function as in the editor; it names nobody, so it needs no scope of its own.
import { openWorkflowRow } from "./workflow-rows";
import { assertCan, assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { getMetrics } from "./workspace-data";
import { deleteWorkflow, saveWorkflow, WorkflowRefused } from "./workflows";
import type { ApprovalScope, AskingSchedule, NobodyElse, TellCondition, WorkflowConfig, WorkflowStep } from "./types";

export { WorkflowRefused };

/** A step as a program sees and sends it (snake_case, like the rest of the API). A Tell step's `id` names it for its
 * memory; leave it out for a new one. */
export type ApiWorkflowStep =
  | { type: "remind"; days_before: number }
  | { type: "escalate"; to: "stand-in" | "owner"; days_after: number }
  | { type: "check"; change_pct: number; outside_target: boolean }
  | { type: "approve"; approvers: string[]; values: ApprovalScope; nobody_else: NobodyElse }
  | { type: "publish"; lock: boolean }
  | { type: "tell"; id?: string; condition: TellCondition; people: string[]; groups: number[] }
  // A Checklist Item (spec 0045): for information (sent to people and Groups) or to tick off (a Task for `assignee`). The
  // text is the owner's own; `id` names it for its claim, left out for a new one. It names people, so like Approve and
  // Tell it is sent back exactly as read by a key without "workflows:people".
  // One shape for both kinds, as the API's schema has it: `day`, `people` and `groups` are for information, the rest to tick off.
  | { type: "checklist"; id?: string; kind: "info" | "tick"; text: string; day?: number; people?: string[]; groups?: number[]; assignee?: string | null; stand_in?: string | null; due_working_days?: number; read_group?: number | null };

/** A Workflow of the key's creator as a program sees it: its Due Date, its steps in order and how many Metrics use it. */
export type ApiWorkflowDetail = { id: number; name: string; due_working_days: number; lock_summary: boolean; steps: ApiWorkflowStep[]; asking: AskingSchedule | null; metrics: number; used_by: { slug: string; name: string }[]; updated_at: string };

/** What to say to make a Workflow. `steps` left out: just the publish step. */
export type NewApiWorkflow = { name: string; due_working_days?: number; lock_summary?: boolean; steps?: ApiWorkflowStep[]; asking?: AskingSchedule | null };
/** What to say to change one: each part left out stays; `steps`, when given, replaces all of them; `asking: null` goes back to the Workspace's daily run. */
export type ApiWorkflowPatch = Partial<NewApiWorkflow>;

const toStep = (s: ApiWorkflowStep): WorkflowStep => {
  switch (s.type) {
    case "remind": return { type: "remind", daysBefore: s.days_before };
    case "escalate": return { type: "escalate", to: s.to, daysAfter: s.days_after };
    case "check": return { type: "check", changePct: s.change_pct, outsideTarget: s.outside_target };
    case "approve": return { type: "approve", approvers: s.approvers, values: s.values, nobodyElse: s.nobody_else };
    case "publish": return { type: "publish", lock: s.lock };
    // An empty id is made up by the editor's cleaning, which also keeps an id only when it is well formed.
    case "tell": return { type: "tell", id: s.id ?? "", condition: s.condition, people: s.people, groups: s.groups };
    case "checklist": {
      const base = { type: "checklist" as const, id: s.id ?? "", text: s.text, ...(typeof s.read_group === "number" ? { readGroup: s.read_group } : {}) };
      return s.kind === "tick" ? { ...base, kind: "tick", assignee: s.assignee ?? null, ...(s.stand_in ? { standIn: s.stand_in } : {}), dueWorkingDays: s.due_working_days ?? 0 } : { ...base, kind: "info", day: s.day ?? 1, people: s.people ?? [], groups: s.groups ?? [] };
    }
  }
};

/** A stored step as a program reads it; Send Snapshot (spec 0045) is not a program's to read or send, so it has no form here. */
const fromStep = (s: WorkflowStep): ApiWorkflowStep | null => {
  switch (s.type) {
    case "remind": return { type: "remind", days_before: s.daysBefore };
    case "escalate": return { type: "escalate", to: s.to, days_after: s.daysAfter };
    case "check": return { type: "check", change_pct: s.changePct, outside_target: s.outsideTarget };
    case "approve": return { type: "approve", approvers: s.approvers, values: s.values ?? "unusual", nobody_else: s.nobodyElse ?? "self-check" };
    case "publish": return { type: "publish", lock: s.lock };
    case "tell": return { type: "tell", id: s.id, condition: s.condition, people: s.people, groups: s.groups };
    case "checklist": {
      const base = { type: "checklist" as const, id: s.id, text: s.text, ...(s.readGroup !== undefined ? { read_group: s.readGroup } : {}) };
      return s.kind === "tick" ? { ...base, kind: "tick", assignee: s.assignee, ...(s.standIn ? { stand_in: s.standIn } : {}), due_working_days: s.dueWorkingDays } : { ...base, kind: "info", day: s.day, people: s.people, groups: s.groups };
    }
    case "send_snapshot": return null;
  }
};

/** At most this many Workflows may be owned by one person through the API: a program cannot fill the Workspace. */
const MAX_OWN_WORKFLOWS = 100;

/** The key's creator as the Actor every core function takes: Workflows are always theirs, whatever the key holds. */
const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

/** Whether this key may choose who approves and who is told: the scope, and a program's key (also in the database). */
async function mayNamePeople(actor: KeyActor): Promise<boolean> {
  if (!actor.key.scopes.includes("workflows:people")) return false;
  const { data: key } = await db().from("access_keys").select("kind, revoked_at").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  return Boolean(key && key.kind === "program" && !key.revoked_at);
}

/** Runs a change of the editor's; its plain refusals (a Tell step without a level) become WorkflowRefused, a fault stays one. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Error && e.constructor === Error) throw new WorkflowRefused(e.message);
    throw e;
  }
}

/** One Workflow of the creator's own as stored, or Forbidden: the same for one that is not there, one of another
 * Workspace and one of someone else's. */
async function load(actor: KeyActor, id: number) {
  const data = await openWorkflowRow(actor.workspaceId, (await db().from("workflows").select("id, name, owner_id, config, updated_at").eq("id", Number(id)).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  if (!data || data.owner_id !== actor.personId) throw new Forbidden();
  return data as { id: number; name: string; owner_id: string; config: WorkflowConfig; updated_at: string };
}

async function detail(actor: KeyActor, id: number): Promise<ApiWorkflowDetail> {
  const w = await load(actor, id);
  // Only the Metrics the creator sees are counted, so a program learns nothing of hidden ones.
  const { data: users } = await db().from("metrics").select("id").eq("workspace_id", actor.workspaceId).eq("workflow_id", id);
  const all = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, all);
  const mine = (users ?? []).filter((u) => seen.has(u.id as number)).map((u) => all.find((m) => m.id === u.id)).filter((m) => m !== undefined);
  return { id: w.id, name: w.name, due_working_days: w.config.dueWorkingDays, lock_summary: w.config.lockSummary === true, steps: w.config.steps.flatMap((x) => { const step = fromStep(x); return step ? [step] : []; }), asking: w.config.asking ?? null, metrics: mine.length, used_by: mine.slice(0, 50).map((m) => ({ slug: m.slug, name: m.name })), updated_at: w.updated_at };
}

/** Approvers are members of this Workspace; the editor would drop others without a word, a program is told (scope workflows:write). */
async function assertMembers(actor: KeyActor, steps: ApiWorkflowStep[]): Promise<void> {
  const named = [...new Set(steps.flatMap((s) => (s.type === "approve" ? s.approvers : s.type === "tell" ? s.people : s.type === "checklist" ? [...(s.people ?? []), s.assignee, s.stand_in].filter((x): x is string => typeof x === "string") : [])))];
  if (!named.length) return;
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", named);
  if ((data ?? []).length !== named.length) throw new WorkflowRefused("Approvers, the people a Tell step tells and the people of a checklist item must be members of this Workspace (ids from list_people).");
}

/** A Workflow of the creator's own, with its steps (scope metrics:read). Someone else's is Forbidden. */
export async function getWorkflowWithKey(actor: KeyActor, id: number): Promise<ApiWorkflowDetail> {
  assertScope(actor, "metrics:read");
  return detail(actor, id);
}

/** Makes a Workflow owned by the key's creator (scope workflows:write); only while their role may create. Without
 * "workflows:people" it has no Approve or Tell step. */
export async function createWorkflowWithKey(actor: KeyActor, input: NewApiWorkflow): Promise<ApiWorkflowDetail> {
  assertScope(actor, "workflows:write");
  const { count } = await db().from("workflows").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId);
  if ((count ?? 0) >= MAX_OWN_WORKFLOWS) throw new WorkflowRefused(`You already own ${MAX_OWN_WORKFLOWS} Workflows; delete one you do not use first.`);
  const steps = input.steps ?? [];
  const people = await mayNamePeople(actor);
  await assertMembers(actor, steps);
  const config: WorkflowConfig = { dueWorkingDays: input.due_working_days ?? 0, steps: steps.map(toStep), ...(input.lock_summary ? { lockSummary: true } : {}), ...(input.asking ? { asking: input.asking } : {}) };
  const id = await refusing(() => saveWorkflow(creatorOf(actor), null, input.name, config, { message: `Made through the API by key ${actor.key.id}`, keepPeople: !people, keepWebhooks: true }));
  return detail(actor, id);
}

/** Changes a Workflow the key's creator owns (scope workflows:write). The parts left out stay; the Workflow's history names the key. */
export async function updateWorkflowWithKey(actor: KeyActor, id: number, patch: ApiWorkflowPatch): Promise<ApiWorkflowDetail> {
  assertScope(actor, "workflows:write");
  assertCan(creatorOf(actor), "create");
  const w = await load(actor, id);
  const people = await mayNamePeople(actor);
  if (patch.steps) await assertMembers(actor, patch.steps);
  const config: WorkflowConfig = {
    dueWorkingDays: patch.due_working_days ?? w.config.dueWorkingDays,
    // Send Snapshot (spec 0045) is never a program's to read, send or change: it names a dashboard and who gets the
    // Workspace's numbers, which only the owner decides in the app. Steps sent in its place keep the stored one as it is.
    steps: patch.steps ? [...patch.steps.map(toStep), ...w.config.steps.filter((x) => x.type === "send_snapshot")] : w.config.steps,
    ...((patch.lock_summary ?? w.config.lockSummary === true) ? { lockSummary: true } : {}),
    // Left out stays, null goes back to the Workspace's run.
    ...((patch.asking === undefined ? w.config.asking : patch.asking) ? { asking: (patch.asking === undefined ? w.config.asking : patch.asking) as AskingSchedule } : {}),
  };
  await refusing(() => saveWorkflow(creatorOf(actor), id, patch.name ?? w.name, config, { message: `Changed through the API by key ${actor.key.id}`, keepPeople: !people, keepWebhooks: true }));
  return detail(actor, id);
}

/** Deletes a Workflow the key's creator owns (scope workflows:write); its Metrics are then asked for nothing by it. */
export async function deleteWorkflowWithKey(actor: KeyActor, id: number): Promise<void> {
  assertScope(actor, "workflows:write");
  assertCan(creatorOf(actor), "create");
  await load(actor, id);
  const people = await mayNamePeople(actor);
  await refusing(() => deleteWorkflow(creatorOf(actor), id, { keepPeople: !people }));
}
