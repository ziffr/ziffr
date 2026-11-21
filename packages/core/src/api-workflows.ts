// Workflows for programs and assistants (GLOSSARY: Workflow, Approver, Self-check, Tell, Access Key; ticket #433). A key
// with "workflows:write" makes, changes and deletes the Workflows its creator owns, steps included, through the very
// functions the Workflow editor uses (workflows.ts), so the same cleaning, limits and history hold. A key acts only for
// its creator: another person's Workflow, or one of another Workspace, answers like one that does not exist (Forbidden,
// so the API says 404). Who approves (an Approve step: its Approvers, which values wait, what happens when nobody else
// could approve) and who a Tell step tells are a person's decision: only a program's key that also holds
// "workflows:people" may change them, never an assistant (not offered, refused where a connection is made, and a check
// in the database); any other key sends those steps back exactly as it read them, or leaves them out when making a
// Workflow. Deleting a Workflow that has such a step needs the same scope, since it would drop the Approvals.
// TODO(#361): the asking schedule (a time and days per Workflow) is built apart and is not on main yet; add its
// fields to ApiWorkflow and the two inputs once its core type exists, rather than guessing its shape here.
import { assertCan, assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { getMetrics } from "./workspace-data";
import { deleteWorkflow, saveWorkflow, WorkflowRefused } from "./workflows";
import type { ApprovalScope, NobodyElse, TellCondition, WorkflowConfig, WorkflowStep } from "./types";

export { WorkflowRefused };

/** A step as a program sees and sends it (snake_case, like the rest of the API). A Tell step's `id` names it for its
 * memory; leave it out for a new one. */
export type ApiWorkflowStep =
  | { type: "remind"; days_before: number }
  | { type: "escalate"; to: "stand-in" | "owner"; days_after: number }
  | { type: "check"; change_pct: number; outside_target: boolean }
  | { type: "approve"; approvers: string[]; values: ApprovalScope; nobody_else: NobodyElse }
  | { type: "publish"; lock: boolean }
  | { type: "tell"; id?: string; condition: TellCondition; people: string[]; groups: number[] };

/** A Workflow of the key's creator as a program sees it: its Due Date, its steps in order and how many Metrics use it. */
export type ApiWorkflowDetail = { id: number; name: string; due_working_days: number; lock_summary: boolean; steps: ApiWorkflowStep[]; metrics: number; updated_at: string };

/** What to say to make a Workflow. `steps` left out: just the publish step. */
export type NewApiWorkflow = { name: string; due_working_days?: number; lock_summary?: boolean; steps?: ApiWorkflowStep[] };
/** What to say to change one: each part left out stays; `steps`, when given, replaces all of them. */
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
  }
};

const fromStep = (s: WorkflowStep): ApiWorkflowStep => {
  switch (s.type) {
    case "remind": return { type: "remind", days_before: s.daysBefore };
    case "escalate": return { type: "escalate", to: s.to, days_after: s.daysAfter };
    case "check": return { type: "check", change_pct: s.changePct, outside_target: s.outsideTarget };
    case "approve": return { type: "approve", approvers: s.approvers, values: s.values ?? "unusual", nobody_else: s.nobodyElse ?? "self-check" };
    case "publish": return { type: "publish", lock: s.lock };
    case "tell": return { type: "tell", id: s.id, condition: s.condition, people: s.people, groups: s.groups };
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
  const { data } = await db().from("workflows").select("id, name, owner_id, config, updated_at").eq("id", Number(id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId) throw new Forbidden();
  return data as { id: number; name: string; owner_id: string; config: WorkflowConfig; updated_at: string };
}

async function detail(actor: KeyActor, id: number): Promise<ApiWorkflowDetail> {
  const w = await load(actor, id);
  // Only the Metrics the creator sees are counted, so a program learns nothing of hidden ones.
  const { data: users } = await db().from("metrics").select("id").eq("workspace_id", actor.workspaceId).eq("workflow_id", id);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId));
  return { id: w.id, name: w.name, due_working_days: w.config.dueWorkingDays, lock_summary: w.config.lockSummary === true, steps: w.config.steps.map(fromStep), metrics: (users ?? []).filter((u) => seen.has(u.id as number)).length, updated_at: w.updated_at };
}

/** Approvers are members of this Workspace; the editor would drop others without a word, a program is told (scope workflows:write). */
async function assertMembers(actor: KeyActor, steps: ApiWorkflowStep[]): Promise<void> {
  const named = [...new Set(steps.flatMap((s) => (s.type === "approve" ? s.approvers : s.type === "tell" ? s.people : [])))];
  if (!named.length) return;
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).in("user_id", named);
  if ((data ?? []).length !== named.length) throw new WorkflowRefused("Approvers and the people a Tell step tells must be members of this Workspace (ids from list_people).");
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
  const config: WorkflowConfig = { dueWorkingDays: input.due_working_days ?? 0, steps: steps.map(toStep), ...(input.lock_summary ? { lockSummary: true } : {}) };
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
    steps: patch.steps ? patch.steps.map(toStep) : w.config.steps,
    ...((patch.lock_summary ?? w.config.lockSummary === true) ? { lockSummary: true } : {}),
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
