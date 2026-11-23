// Workflows (GLOSSARY: Workflow, Stand-in, Away, Approval, Self-check, Lock): defining them, giving a Metric one,
// running them, approving or sending back values, checking one's own, locking periods, stand-ins and away dates. Every function takes the Actor first
// and works only inside the actor's Workspace.
import { openOne } from "./sealed-columns";
import { openWorkflowRow, sealedWorkflowConfig } from "./workflow-rows";
import { mapConfigNumbers } from "./sealed-workflow";
import { workspaceCipher } from "./workspace-keys";
import { db } from "./db";
import { assertCan, can, Forbidden, type Actor } from "./actor";
import { assertMembersIn } from "./sharing";
import { assertSubmittersIn } from "./metrics";
import { FROM_APP, type ChangeSource } from "./webhook-events";
import { approve, closePeriod, confirmSelfCheck, correctSelfCheck, runWorkflows, sendBack, setLock } from "./workflow-engine";
import { claimAskingDay, claimDay, runClaimedAskingDay, runClaimedDay, skipPassedAskingDay, type RunCounts } from "./scheduled-runs";
import { cleanAsking } from "./asking-schedule";
import { DEMO_READ_ONLY } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";
import { localTime, workspaceClock } from "./workspace-clock";
import { ensureBaseline, recordVersion } from "./versions";
import type { ChecklistItem, WorkflowConfig, WorkflowStep } from "./types";
import { audit } from "./audit-log";
import { getGroups } from "./access";
import { guestWorkflowIds } from "./period-timeline";
import { validCondition } from "./alert-rules";
import { CHECKLIST_DAYS_MAX, TELL_GROUPS_PER_STEP, CHECKLIST_ITEMS_PER_WORKFLOW, TELL_PEOPLE_PER_STEP, CHECKLIST_TEXT_MAX, TELL_STEPS_PER_WORKFLOW, TELL_WEBHOOKS_PER_STEP } from "./alert-limits";
import { mayManageWebhooks } from "./webhooks";
import { mayTakeSnapshot } from "./snapshots";
import { PLAIN } from "./file-text";
import { randomUUID } from "node:crypto";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
const day = (v: unknown) => {
  if (!DAY.test(String(v))) throw new Error("Pick a day.");
  return String(v);
};

/** Steps as they may be stored: known types, sane numbers, approvers who are members, at most one check, approval and
 * publish, and publishing last. */
async function cleanConfig(actor: Actor, c: WorkflowConfig, stored: WorkflowConfig | null = null, keepWebhooks = false): Promise<WorkflowConfig> {
  const { data: people } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId);
  const ids = new Set((people ?? []).map((p) => p.user_id as string));
  const groupIds = new Set((await getGroups(actor.workspaceId)).map((g) => g.id));
  // Webhooks send the Workspace's data outside Ziffr, so only an Owner or Admin names them (spec 0034): they pick among the
  // Workspace's own Webhooks. Anyone else saving the Workflow leaves a step's Webhooks exactly as they were stored.
  // `keepWebhooks`: the API and MCP never name Webhooks, so a Tell step they save keeps the ones it had.
  const manages = mayManageWebhooks(actor) && !keepWebhooks;
  const hooks = new Set<string>();
  if (manages) for (const h of (await db().from("webhooks").select("id").eq("workspace_id", actor.workspaceId).is("owner_id", null)).data ?? []) hooks.add(String(h.id));
  const steps: WorkflowStep[] = [];
  let others = 0;
  let items = 0;
  // The day an item is added is the Workspace's own day, the one the Workflows run by.
  const today = localTime(new Date(), (await workspaceClock(actor)).timeZone).day;
  const list = <T,>(v: unknown, ok: (x: unknown) => x is T, max: number) => [...new Set((Array.isArray(v) ? v : []).filter(ok))].slice(0, max);
  const idOk = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9-]{8,40}$/.test(id) && !steps.some((x) => "id" in x && x.id === id);
  for (const s of Array.isArray(c?.steps) ? c.steps : []) {
    // Checklist Items count apart: the other steps stop at 12, the items at 20 (spec 0045).
    if (s?.type === "checklist") {
      if (items < CHECKLIST_ITEMS_PER_WORKFLOW) { steps.push(cleanItem(s as ChecklistItem, idOk, { ids, groupIds, list, stored, today })); items++; }
      continue;
    }
    if (++others > 12) continue;
    if (s.type === "remind") steps.push({ type: "remind", daysBefore: int(s.daysBefore, 0, 30) });
    else if (s.type === "escalate") steps.push({ type: "escalate", to: s.to === "owner" ? "owner" : "stand-in", daysAfter: int(s.daysAfter, 0, 30) });
    else if (s.type === "check" && !steps.some((x) => x.type === "check")) steps.push({ type: "check", changePct: int(s.changePct, 1, 1000), outsideTarget: Boolean(s.outsideTarget) });
    else if (s.type === "approve" && !steps.some((x) => x.type === "approve")) steps.push({ type: "approve", approvers: [...new Set((Array.isArray(s.approvers) ? s.approvers : []).map(String).filter((a) => ids.has(a)))].slice(0, 3), values: s.values === "every" ? "every" : "unusual", nobodyElse: s.nobodyElse === "count" ? "count" : "self-check" });
    else if (s.type === "tell" && steps.filter((x) => x.type === "tell").length < TELL_STEPS_PER_WORKFLOW) {
      // A Tell step: a level or a share as plain text (the Alert rules decide), members and Groups of this Workspace only.
      const c = s.condition as unknown;
      if (!validCondition(c) || c.kind === "missing_after_due") throw new Error("A Tell step needs a level or a share it can wait for.");
      const id = idOk(s.id) ? s.id : randomUUID();
      const kept = (stored?.steps ?? []).find((x): x is Extract<WorkflowStep, { type: "tell" }> => x.type === "tell" && x.id === id)?.webhooks ?? [];
      const webhooks = manages ? list(s.webhooks, (x): x is string => typeof x === "string" && hooks.has(x), TELL_WEBHOOKS_PER_STEP) : kept;
      steps.push({ type: "tell", id, ...(webhooks.length ? { webhooks } : {}), condition: c.kind === "at_or_above" || c.kind === "below" ? { kind: c.kind, value: c.value } : { kind: c.kind, share: c.share }, people: list(s.people, (x): x is string => typeof x === "string" && ids.has(x), TELL_PEOPLE_PER_STEP), groups: list(s.groups, (x): x is number => typeof x === "number" && groupIds.has(x), TELL_GROUPS_PER_STEP) });
    }
    else if (s.type === "send_snapshot" && !steps.some((x) => x.type === "send_snapshot")) steps.push(await cleanSendSnapshot(actor, s as SendSnapshot, idOk, { ids, groupIds, list, stored, today }));
    else if (s.type === "publish" && !steps.some((x) => x.type === "publish")) steps.push({ type: "publish", lock: Boolean(s.lock) });
  }
  const pub = steps.filter((s) => s.type === "publish");
  // The owner's rule is "approved, published and locked", and it is the one automatic Snapshots use (spec 0045).
  if (steps.some((s) => s.type === "send_snapshot") && !pub.some((s) => s.type === "publish" && s.lock)) throw new Error("A Send Snapshot step goes when the period is finished, so the Publish step must lock: tick \"Lock\" on it.");
  const asking = cleanAsking(c?.asking);
  return { dueWorkingDays: int(c?.dueWorkingDays, 0, 30), steps: [...steps.filter((s) => s.type !== "publish"), ...(pub.length ? pub : [{ type: "publish", lock: false } as WorkflowStep])], ...(c?.lockSummary === true ? { lockSummary: true } : {}), ...(asking ? { asking } : {}) };
}

/** One Checklist Item as it may be stored (spec 0045): words of 1 to 500 characters, plain; days in range; people, Groups
 * and the Group that may read it only of this Workspace. The id is kept when well formed and unused. A text that is
 * empty or too long is refused in words (the editor and the API show them); a person who is no member is left out. */
function cleanItem(s: ChecklistItem, idOk: (id: unknown) => id is string, known: { ids: Set<string>; groupIds: Set<number>; list: <T>(v: unknown, ok: (x: unknown) => x is T, max: number) => T[]; stored: WorkflowConfig | null; today: string }): ChecklistItem {
  // Plain text: control characters other than a line break go, and so do the characters that make words read other than
  // they are written (bidi overrides, zero-width characters, line and paragraph separators); no markup is rendered where it is shown.
  const text = (typeof s.text === "string" ? s.text : "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "").trim();
  if (!text) throw new Error("A checklist item needs its words.");
  // The words must be what a Pack and a Workspace Export carry (one rule for plain text, file-text.ts), so no Workflow is ever left out of an export for them.
  if (!new RegExp(PLAIN, "u").test(text)) throw new Error("A checklist item holds plain words only: no line breaks, web addresses, markup or brackets. Letters, digits and everyday punctuation are fine.");
  if ([...text].length > CHECKLIST_TEXT_MAX) throw new Error(`A checklist item holds at most ${CHECKLIST_TEXT_MAX} characters.`);
  const id = idOk(s.id) ? s.id : randomUUID();
  // The Workspace's day it was first saved: kept from the stored item, never taken from what was sent.
  const addedOn = (known.stored?.steps ?? []).find((x): x is ChecklistItem => x.type === "checklist" && x.id === id)?.addedOn ?? known.today;
  const readGroup = typeof s.readGroup === "number" && known.groupIds.has(s.readGroup) ? { readGroup: s.readGroup } : {};
  if (s.kind === "tick") {
    const assignee = typeof s.assignee === "string" && known.ids.has(s.assignee) ? s.assignee : null;
    const standIn = typeof s.standIn === "string" && known.ids.has(s.standIn) && s.standIn !== assignee ? { standIn: s.standIn } : {};
    return { type: "checklist", id, kind: "tick", text, assignee, ...standIn, dueWorkingDays: int(s.dueWorkingDays, 0, CHECKLIST_DAYS_MAX), ...readGroup, addedOn };
  }
  const info = s as Extract<ChecklistItem, { kind: "info" }>;
  return { type: "checklist", id, kind: "info", text, day: int(info.day, 1, CHECKLIST_DAYS_MAX), people: known.list(info.people, (x): x is string => typeof x === "string" && known.ids.has(x), TELL_PEOPLE_PER_STEP), groups: known.list(info.groups, (x): x is number => typeof x === "number" && known.groupIds.has(x), TELL_GROUPS_PER_STEP), ...readGroup, addedOn };
}

type SendSnapshot = Extract<WorkflowStep, { type: "send_snapshot" }>;

/** The Send Snapshot step as it may be stored (spec 0045): people and Groups of this Workspace only, and a dashboard the
 * owner may take a Snapshot of (they own or edit it and see every Metric on it), checked here and again when it runs. A
 * dashboard 0 is none picked yet (a template's). A dashboard kept as it was stored is not checked again, so a step whose
 * owner has since lost sight of it does not stop every other change of the Workflow. */
async function cleanSendSnapshot(actor: Actor, s: SendSnapshot, idOk: (id: unknown) => id is string, known: { ids: Set<string>; groupIds: Set<number>; list: <T>(v: unknown, ok: (x: unknown) => x is T, max: number) => T[]; stored: WorkflowConfig | null; today: string }): Promise<SendSnapshot> {
  const id = idOk(s.id) ? s.id : randomUUID();
  const was = (known.stored?.steps ?? []).find((x): x is SendSnapshot => x.type === "send_snapshot" && x.id === id);
  const dashboardId = Number.isInteger(Number(s.dashboardId)) && Number(s.dashboardId) > 0 ? Number(s.dashboardId) : 0;
  if (dashboardId && dashboardId !== was?.dashboardId && !(await mayTakeSnapshot(actor, dashboardId))) throw new Error("Pick a dashboard you own or edit and see every Metric of: its Snapshot is taken in your name.");
  return {
    type: "send_snapshot", id, dashboardId,
    people: known.list(s.people, (x): x is string => typeof x === "string" && known.ids.has(x), TELL_PEOPLE_PER_STEP),
    groups: known.list(s.groups, (x): x is number => typeof x === "number" && known.groupIds.has(x), TELL_GROUPS_PER_STEP),
    // The day it was first saved, kept from the stored step: a period that finished before it is not sent.
    addedOn: was?.addedOn ?? known.today,
  };
}

/** A refusal in Ziffr's words, written for the person who asked (programs and assistants get it as 422). */
export class WorkflowRefused extends Error {
  constructor(message: string) { super(message); this.name = "WorkflowRefused"; }
}

/** The steps that name people: who approves, who a Tell step or a Checklist Item tells or gives its Task to, who gets a Snapshot. A key without "workflows:people" cannot change them. */
const peopleSteps = (c: WorkflowConfig) => JSON.stringify(c.steps.filter((s) => s.type === "approve" || s.type === "tell" || s.type === "checklist" || s.type === "send_snapshot"));

/** A Workflow of the actor's workspace that the actor owns, or Forbidden; returns its stored steps. */
async function ownWorkflow(actor: Actor, id: number): Promise<WorkflowConfig | null> {
  const { data } = await db().from("workflows").select("id, owner_id, config").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId) throw new Forbidden();
  return ((await openWorkflowRow(actor.workspaceId, data))?.config as WorkflowConfig | null) ?? null;
}

/** Saves a Workflow: a new one (Guests create nothing) or one the actor owns. Returns its id. */
export async function saveWorkflow(actor: Actor, id: number | null, name: string, config: WorkflowConfig, opts: { message?: string; keepPeople?: boolean; keepWebhooks?: boolean } = {}): Promise<number> {
  let stored: WorkflowConfig | null = null;
  if (id) stored = await ownWorkflow(actor, id);
  const row = { name: String(name ?? "").trim().slice(0, 80) || "Untitled workflow", config: await cleanConfig(actor, config, stored, opts.keepWebhooks), updated_at: new Date().toISOString() };
  // What is stored carries its numbers sealed for the Workflow (spec 0028); everything above works on the opened config.
  const store = async (workflowId: number) => ({ ...row, config: await sealedWorkflowConfig(actor.workspaceId, workflowId, row.config) });
  let before: string | undefined;
  let seen: string | null = null;
  if (opts.keepPeople) {
    // The caller (an Access Key without "workflows:people") may not decide who approves or who is told: the Approve and
    // Tell steps must be exactly those stored (none for a new Workflow). Checked here, where every save passes.
    const was = stored ? await cleanConfig(actor, stored, stored, true) : { dueWorkingDays: 0, steps: [] };
    if (id) seen = ((await db().from("workflows").select("updated_at").eq("id", id).eq("workspace_id", actor.workspaceId).single()).data?.updated_at as string | undefined) ?? null;
    if (peopleSteps(row.config) !== peopleSteps(was)) throw new WorkflowRefused("This key cannot choose who approves or who is told: send the Approve and Tell steps exactly as they were read, or none for a new Workflow.");
    // An Approve step that holds back only Unusual Values holds nothing without the check that finds them.
    const holdsUnusual = was.steps.some((x) => x.type === "approve" && x.values !== "every");
    if (holdsUnusual && was.steps.some((x) => x.type === "check") && !row.config.steps.some((x) => x.type === "check")) throw new WorkflowRefused("This Workflow's Approve step holds back Unusual Values, so its check step stays; change the check instead.");
  }
  if (id) {
    before = JSON.stringify(stored?.asking);
    await ensureBaseline("workflow", id, actor.personId);
    // For a key: only if nobody changed it (the editor, say, giving it other Approvers) since the Approve and Tell steps were compared.
    let q = db().from("workflows").update(await store(id)).eq("id", id).eq("workspace_id", actor.workspaceId);
    if (seen) q = q.eq("updated_at", seen);
    const { data: done } = await q.select("id");
    if (!done?.length) throw new WorkflowRefused("The Workflow changed meanwhile. Read it again and retry.");
  } else {
    assertCan(actor, "create");
    // Its numbers are bound to its id, which the database hands out: where they are sealed, the row is made without them
    // (nothing in clear is stored) and filled with the sealed config at once.
    const sealing = (await workspaceCipher(actor.workspaceId)).sealing;
    const bare = sealing ? { ...row, config: mapConfigNumbers(row.config, () => "0", "") } : row;
    const { data, error } = await db().from("workflows").insert({ ...bare, owner_id: actor.personId, workspace_id: actor.workspaceId }).select("id").single();
    if (error || !data) throw new Error("The workflow could not be saved.");
    id = data.id as number;
    if (sealing) {
      const { error: sealError } = await db().from("workflows").update({ config: (await store(id)).config }).eq("id", id).eq("workspace_id", actor.workspaceId);
      if (sealError) {
        await db().from("workflows").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
        throw new Error("The workflow could not be saved.");
      }
    }
  }
  // A new or changed Asking Schedule never runs for a day that has begun (spec 0035).
  if (row.config.asking && JSON.stringify(row.config.asking) !== before) await skipPassedAskingDay(actor.workspaceId, id, row.config.asking);
  await recordVersion("workflow", id, actor.personId, opts);
  // Where a Workflow sends the Workspace's data is Audit Log business, as the Webhooks themselves are.
  const named = (cfg: WorkflowConfig | null) => new Set((cfg?.steps ?? []).flatMap((x) => (x.type === "tell" ? x.webhooks ?? [] : [])));
  const [hooksBefore, hooksAfter] = [named(stored), named(row.config)];
  const added = [...hooksAfter].filter((h) => !hooksBefore.has(h)).length;
  const removed = [...hooksBefore].filter((h) => !hooksAfter.has(h)).length;
  await auditChecklist(actor, id, row.name, stored, row.config);
  await auditSendSnapshot(actor, id, row.name, stored, row.config);
  if (added || removed) await audit(actor, { kind: "workflow.webhooks_set", object: { type: "workflow", id, name: row.name }, details: { added, removed, added_ids: [...hooksAfter].filter((h) => !hooksBefore.has(h)), removed_ids: [...hooksBefore].filter((h) => !hooksAfter.has(h)) } });
  return id;
}

/** Records a change of a Workflow's Checklist Items in the Audit Log (spec 0045): ids and counts only, never the words. */
async function auditChecklist(actor: Actor, id: number, name: string, before: WorkflowConfig | null, after: WorkflowConfig): Promise<void> {
  // The stored config comes back from the database with its keys in another order: compare by sorted keys.
  const sorted = (_key: string, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);
  const items = (c: WorkflowConfig | null) => new Map((c?.steps ?? []).filter((x): x is ChecklistItem => x.type === "checklist").map((x) => [x.id, JSON.stringify(x, sorted)]));
  const [was, now] = [items(before), items(after)];
  const added = [...now.keys()].filter((k) => !was.has(k));
  const removed = [...was.keys()].filter((k) => !now.has(k));
  const changed = [...now.keys()].filter((k) => was.has(k) && was.get(k) !== now.get(k));
  if (!added.length && !removed.length && !changed.length) return;
  await audit(actor, { kind: "workflow.checklist_set", object: { type: "workflow", id, name }, details: { added: added.length, removed: removed.length, changed: changed.length, added_ids: added, removed_ids: removed, changed_ids: changed } });
}

/** Records a change of who gets a Workflow's Snapshot in the Audit Log (spec 0045): the dashboard's id and the ids of the people and Groups added or removed. */
async function auditSendSnapshot(actor: Actor, id: number, name: string, before: WorkflowConfig | null, after: WorkflowConfig): Promise<void> {
  const pick = (c: WorkflowConfig | null) => (c?.steps ?? []).find((x): x is SendSnapshot => x.type === "send_snapshot") ?? null;
  const [was, now] = [pick(before), pick(after)];
  const diff = (a: string[], b: string[]) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });
  const people = diff(was?.people ?? [], now?.people ?? []);
  const groups = diff((was?.groups ?? []).map(String), (now?.groups ?? []).map(String));
  if (was?.dashboardId === now?.dashboardId && !people.added.length && !people.removed.length && !groups.added.length && !groups.removed.length) return;
  await audit(actor, { kind: "workflow.send_snapshot_set", object: { type: "workflow", id, name }, details: { dashboard_id: now?.dashboardId ?? null, was_dashboard_id: was?.dashboardId ?? null, removed: !now, people_added: people.added, people_removed: people.removed, groups_added: groups.added, groups_removed: groups.removed } });
}

/** Changes only the check step of a Workflow the actor owns (GLOSSARY: Unusual Value): when a value is unusual. The
 * rest of the Workflow stays exactly as stored, and the change is refused when the Workflow changed since `seen` (its
 * updated_at as read), so an edit in the Workflow editor meanwhile is never overwritten. Returns false when refused. */
export async function setWorkflowCheck(actor: Actor, id: number, check: { changePct?: number; outsideTarget?: boolean }, seen: string): Promise<boolean> {
  await ownWorkflow(actor, id);
  const { data: sealedWf } = await db().from("workflows").select("id, config, updated_at").eq("id", id).eq("workspace_id", actor.workspaceId).single();
  const wf = await openWorkflowRow(actor.workspaceId, sealedWf);
  if (!wf || wf.updated_at !== seen) return false;
  const config = wf.config as WorkflowConfig;
  if (!config.steps.some((s) => s.type === "check")) return false;
  const steps = config.steps.map((s) => (s.type === "check" ? { ...s, changePct: check.changePct === undefined ? s.changePct : int(check.changePct, 1, 1000), outsideTarget: check.outsideTarget ?? s.outsideTarget } : s));
  await ensureBaseline("workflow", id, actor.personId);
  const { data: done } = await db().from("workflows").update({ config: await sealedWorkflowConfig(actor.workspaceId, id, { ...config, steps }), updated_at: new Date().toISOString() })
    .eq("id", id).eq("workspace_id", actor.workspaceId).eq("updated_at", seen).select("id");
  if (!done?.length) return false;
  await recordVersion("workflow", id, actor.personId, { message: "Changed its Unusual Value check" });
  return true;
}

/** Deletes a Workflow the actor owns. With `keepPeople` (an Access Key without "workflows:people") a Workflow that has an
 * Approve or Tell step is refused: deleting it would drop its Approvals. */
export async function deleteWorkflow(actor: Actor, id: number, opts: { keepPeople?: boolean } = {}) {
  await ownWorkflow(actor, id);
  let seen: string | null = null;
  if (opts.keepPeople) {
    const { data } = await db().from("workflows").select("id, config, updated_at").eq("id", id).eq("workspace_id", actor.workspaceId).single();
    if ((((await openWorkflowRow(actor.workspaceId, data))?.config as WorkflowConfig | undefined)?.steps ?? []).some((s) => s.type === "approve" || s.type === "tell" || s.type === "checklist" || s.type === "send_snapshot")) throw new WorkflowRefused("This key cannot delete a Workflow that has an Approve, Tell, checklist or Send Snapshot step: that decides who approves and who is told.");
    seen = data!.updated_at as string;
  }
  let q = db().from("workflows").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
  // For a key: not if the Workflow gained an Approve step since it was read.
  if (seen) q = q.eq("updated_at", seen);
  const { data: gone } = await q.select("id");
  if (seen && !gone?.length) throw new WorkflowRefused("The Workflow changed meanwhile. Read it again and retry.");
}

/** A Metric's owner decides which Workflow its values take (none for Derived Metrics). */
export async function setMetricWorkflow(actor: Actor, metricId: number, workflowId: number | null, opts: { from?: number | null } = {}) {
  const m = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("id, name, owner_id, formula, workflow_id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  if (!m || m.owner_id !== actor.personId || m.formula) throw new Forbidden();
  const wf = workflowId === null ? null : (await db().from("workflows").select("id, name").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle()).data;
  if (workflowId !== null && !wf) throw new Forbidden();
  // `from`: a key checked who approves for the Workflow the Metric had then, so it is written only if it still has it.
  let write = db().from("metrics").update({ workflow_id: workflowId }).eq("id", metricId).eq("workspace_id", actor.workspaceId);
  if (opts.from !== undefined) write = opts.from === null ? write.is("workflow_id", null) : write.eq("workflow_id", opts.from);
  const { data: changed } = await write.select("id");
  if (opts.from !== undefined && !changed?.length) throw new WorkflowRefused("The Metric's Workflow changed meanwhile. Read it again and retry.");
  if ((m.workflow_id ?? null) !== workflowId) {
    await audit(actor, { kind: "metric.workflow_set", object: { type: "metric", id: metricId, name: m.name }, details: { workflow_id: workflowId, workflow_name: (wf?.name as string | undefined) ?? null, from_workflow_id: m.workflow_id ?? null } });
  }
}

/** Runs the demo's Workflows as of any day, to try what the clock does in a real workspace (spec 0005). Only the
 * demo may pretend: elsewhere a day runs once, by the clock or by runTodayNow. Guests run nothing. */
export async function runWorkflowsAsOf(actor: Actor, asOf: string): Promise<string[]> {
  assertCan(actor, "create");
  if (actor.workspaceId !== DEMO_WORKSPACE_ID) throw new Forbidden("Only the demo can pretend it is another day.");
  return runWorkflows(actor.workspaceId, day(asOf), actor.personId);
}

/** A day's run as the Workflows page shows it. */
export type RunInfo = { day: string; trigger: "schedule" | "manual"; state: "running" | "done" | "failed"; startedAt: string; counts: RunCounts };

/** When Workflows run in the actor's workspace, the last run, and whether today has run (spec 0005). */
export async function workflowSchedule(actor: Actor): Promise<{ timeZone: string; runHour: number; today: string; hour: number; todayRan: boolean; lastRun: RunInfo | null; scheduled: boolean }> {
  const clock = await workspaceClock(actor);
  const { day: today, hour } = localTime(new Date(), clock.timeZone);
  const [{ data: last }, { count: scheduled }] = await Promise.all([
    db().from("workflow_runs").select("day, trigger, state, started_at, prompts, reminders, escalations").eq("workspace_id", actor.workspaceId).order("day", { ascending: false }).limit(1).maybeSingle(),
    db().from("workflow_runs").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("trigger", "schedule"),
  ]);
  return {
    // A day at or after today was claimed (also before a change of time zone): today will not run again.
    ...clock, today, hour, todayRan: Boolean(last && last.day >= today), scheduled: (scheduled ?? 0) > 0,
    lastRun: last ? { day: last.day, trigger: last.trigger, state: last.state, startedAt: last.started_at, counts: { prompts: last.prompts, reminders: last.reminders, escalations: last.escalations } } : null,
  };
}

/** Runs today's steps now, for Owners and Admins of a real workspace: the same claim as the clock's run, so it does
 * nothing once today ran, and the clock then leaves today alone. Without `workflowId` it is the Workspace's run (the
 * Workflows without an Asking Schedule and the due-task reminders); with one, that Workflow's own run, also for its
 * owner (spec 0035). Returns the counts, or null when today ran already. */
export async function runTodayNow(actor: Actor, workflowId?: number): Promise<RunCounts | null> {
  const { day: today } = localTime(new Date(), (await workspaceClock(actor)).timeZone);
  if (workflowId !== undefined) {
    // Guests run nothing, and the demo is never scheduled.
    assertCan(actor, "create");
    if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden(DEMO_READ_ONLY);
    const wf = await openWorkflowRow(actor.workspaceId, (await db().from("workflows").select("id, owner_id, config").eq("id", Number(workflowId)).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
    // Not in this workspace, or not the actor's to run: the same answer, so ids of other workspaces are not told apart.
    if (!wf || (wf.owner_id !== actor.personId && actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only the Workflow's owner, Owners and Admins run it.");
    if (!(wf.config as WorkflowConfig).asking) throw new Error("This Workflow runs with the workspace's daily run: run today's steps from the workspace.");
    const runId = await claimAskingDay(actor.workspaceId, wf.id as number, today, "manual");
    if (runId === null) return null;
    const counts = await runClaimedAskingDay(runId, actor.workspaceId, wf.id as number, today);
    await audit(actor, { kind: "workflow.run_now", object: { type: "workflow", id: wf.id as number }, details: { day: today, ...counts } });
    return counts;
  }
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins run today's steps.");
  const runId = await claimDay(actor.workspaceId, today, "manual");
  if (runId === null) return null;
  const counts = await runClaimedDay(runId, actor.workspaceId, today);
  await audit(actor, { kind: "workflow.run_now", object: { type: "workspace", id: actor.workspaceId }, details: { day: today, ...counts } });
  return counts;
}

/** The last run of a Workflow on its own Asking Schedule, or null when it has none yet (a skipped day is no run). */
export async function workflowAskingRun(actor: Actor, workflowId: number): Promise<RunInfo | null> {
  // A Guest learns of no Workflow beyond those of the Metrics shared with them.
  const guestSees = await guestWorkflowIds(actor);
  if (guestSees && !guestSees.has(Number(workflowId))) return null;
  const { data } = await db().from("workflow_asking_runs").select("day, trigger, state, started_at, prompts, reminders, escalations").eq("workspace_id", actor.workspaceId).eq("workflow_id", Number(workflowId)).neq("state", "skipped").order("day", { ascending: false }).limit(1).maybeSingle();
  return data ? { day: data.day, trigger: data.trigger === "manual" ? "manual" : "schedule", state: data.state, startedAt: data.started_at, counts: { prompts: data.prompts, reminders: data.reminders, escalations: data.escalations } } : null;
}

/** The approver approves a value waiting for them. */
export async function approveValue(actor: Actor, actionId: number, source: ChangeSource = FROM_APP): Promise<string> {
  return approve(actor.workspaceId, Number(actionId), actor.personId, source);
}

/** The submitter confirms their own value in a Self-check (GLOSSARY: Self-check). */
export async function confirmOwnValue(actor: Actor, actionId: number, source: ChangeSource = FROM_APP): Promise<string> {
  return confirmSelfCheck(actor.workspaceId, Number(actionId), actor.personId, source);
}

/** The submitter corrects their own value in a Self-check; the number is checked in the engine. */
export async function correctOwnValue(actor: Actor, actionId: number, value: number, source: ChangeSource = FROM_APP): Promise<string> {
  return correctSelfCheck(actor.workspaceId, Number(actionId), actor.personId, Number(value), source);
}

/** The approver sends a value back with what to check. */
export async function sendValueBack(actor: Actor, actionId: number, comment: string, source: ChangeSource = FROM_APP) {
  await sendBack(actor.workspaceId, Number(actionId), actor.personId, String(comment ?? "").slice(0, 1000), source);
}

/** The Metric owner locks or unlocks a period; unlocking needs a reason. */
export async function lockPeriod(actor: Actor, metricId: number, period: string, lock: boolean, reason?: string) {
  await setLock(actor.workspaceId, Number(metricId), day(period), Boolean(lock), actor.personId, reason ? String(reason).slice(0, 300) : undefined);
  // The period only: the reason is free text and stays with the period itself.
  const m = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select("id, name").eq("id", Number(metricId)).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  await audit(actor, { kind: lock ? "period.locked" : "period.unlocked", object: { type: "metric", id: Number(metricId), name: m?.name ?? null }, details: { period } });
}

/** The Workflow's owner closes a period: every Metric of it with a value locks. Returns how many. */
export async function closeWorkflowPeriod(actor: Actor, workflowId: number, asOf: string): Promise<number> {
  // Only the demo pretends; elsewhere the period is the one that has ended as of the workspace's today.
  const asOfDay = actor.workspaceId === DEMO_WORKSPACE_ID ? day(asOf) : localTime(new Date(), (await workspaceClock(actor)).timeZone).day;
  const locked = await closePeriod(actor.workspaceId, Number(workflowId), asOfDay, actor.personId);
  const { data: wf } = await db().from("workflows").select("name").eq("id", Number(workflowId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "period.closed", object: { type: "workflow", id: Number(workflowId), name: wf?.name ?? null }, details: { as_of: asOfDay, locked } });
  return locked;
}

/** The Metric owner chooses who stands in for a submitter: a member who is no Guest, or a Contact, of the workspace. */
export async function setStandIn(actor: Actor, metricId: number, submitterId: string, standInId: string | null) {
  const { data: m } = await db().from("metrics").select("owner_id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId || standInId === submitterId) throw new Forbidden();
  if (standInId) {
    await assertSubmittersIn(actor, [standInId]);
    // A Stand-in's answer is a Filled-in Value, which a Guest never enters (spec 0046). A Guest already chosen keeps being
    // asked and answers as their own, but nobody new is chosen.
    const { data: guest } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).eq("user_id", standInId).eq("role", "guest").maybeSingle();
    if (guest) throw new Error("A Guest cannot stand in for someone.");
  }
  await db().from("tokens").update({ stand_in_id: standInId }).eq("metric_id", metricId).eq("workspace_id", actor.workspaceId).eq("submitter_id", submitterId).is("stands_in_for", null);
  // Whoever stood in before loses their stand-in Token at once.
  await db().from("tokens").delete().eq("metric_id", metricId).eq("workspace_id", actor.workspaceId).eq("stands_in_for", submitterId).neq("submitter_id", standInId ?? "");
}

/** People set their own away dates; owners and admins can set any member's. null clears them. */
export async function setAway(actor: Actor, personId: string, starts: string | null, ends: string | null) {
  if (personId !== actor.personId) {
    if (!can(actor, "manage-members")) throw new Forbidden();
    await assertMembersIn(actor, [personId]);
  }
  if (starts && ends && (!DAY.test(starts) || !DAY.test(ends) || ends < starts)) throw new Error("Pick a start and an end date.");
  await db().from("away").delete().eq("user_id", personId);
  if (starts && ends) await db().from("away").insert({ user_id: personId, starts, ends });
}
