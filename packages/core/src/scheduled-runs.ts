// Workflows on a clock (spec 0005, ticket #85; GLOSSARY: Workflow, Due Date, Escalation). A job a scheduler calls
// every hour runs each workspace's Workflows once a day, at its run hour in its own time zone, and reminds people of
// tasks due within two days. Each day is claimed in workflow_runs before anything is sent, so it runs once.
import { openWorkflowRows } from "./workflow-rows";
import { addDays, format, parseISO } from "date-fns";
import { db } from "./db";
import { deliver } from "./deliveries";
import { DEMO_WORKSPACE_ID } from "./team";
import { localTime } from "./workspace-clock";
import { runWorkflows } from "./workflow-engine";
import { takeDueSnapshots } from "./auto-snapshots";
import { askingHour, isAskingDay, isAskingDue } from "./asking-schedule";
import type { AskingSchedule, WorkflowConfig } from "./types";

/** How a day's run went, counted per Metric: asked for its value, reminded, escalated. */
export type RunCounts = { prompts: number; reminders: number; escalations: number };

/** What became of one workspace on one call: ran, already ran today, not yet its hour, or failed. */
export type RunOutcome = "ran" | "already_ran" | "not_yet" | "failed";

/** Reminds assignees of open tasks due within two days of `day` (GLOSSARY: Due Date); the emails are queued for the
 * deliveries job. Returns how many. */
export async function remindDueTasks(workspaceId: string, day: string): Promise<number> {
  const soon = format(addDays(parseISO(day), 2), "yyyy-MM-dd");
  const { data: rows } = await db().from("actions").select("id, asker_id, assignee_id, metrics(archived_at)").eq("workspace_id", workspaceId).eq("kind", "task").eq("status", "open").not("due_date", "is", null).lte("due_date", soon);
  // A task about an Archived Metric is not reminded of: it asks for nothing until it is brought back.
  const data = (rows ?? []).filter((a) => !(a.metrics as { archived_at?: string | null } | null)?.archived_at);
  // Queued: the deliveries job sends them, so many reminders never hold the run up on the mail server.
  for (const a of data) await deliver({ kind: "reminder", actionId: a.id, senderId: a.asker_id, recipientId: a.assignee_id, queue: true });
  return data.length;
}

/** Claims a workspace's day: the run's id for the one call that may run it, null for every other. Only a day later
 * than every day the workspace has claimed: a changed time zone cannot run yesterday or tomorrow, or a day twice. */
export async function claimDay(workspaceId: string, day: string, trigger: "schedule" | "manual"): Promise<number | null> {
  const { data, error } = await db().rpc("claim_workflow_day", { p_workspace: workspaceId, p_day: day, p_trigger: trigger });
  if (error) throw new Error("The run could not be claimed.");
  return (data as number | null) ?? null;
}

/** What a run's log says it did, in counts. */
function countsOf(log: string[]): RunCounts {
  return {
    prompts: log.filter((l) => /: asked /.test(l)).length,
    reminders: log.filter((l) => /: reminded$/.test(l)).length,
    escalations: log.filter((l) => /: (asked the stand-in|told the owner)$/.test(l)).length,
  };
}

/** Does a claimed run's work and writes how it went into its row (`table`): done with counts, or failed with only the
 * kind of failure, since the details may name people or Metrics. The first Owner of the workspace is who acts. */
async function recorded(table: "workflow_runs" | "workflow_asking_runs", runId: number, workspaceId: string, work: (owner: string) => Promise<RunCounts>): Promise<RunCounts> {
  try {
    const { data: owner } = await db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").order("created_at").limit(1).maybeSingle();
    if (!owner) throw Object.assign(new Error("no owner"), { kind: "no_owner" });
    const counts = await work(owner.user_id as string);
    await db().from(table).update({ ...counts, state: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    return counts;
  } catch (e) {
    await db().from(table).update({ state: "failed", finished_at: new Date().toISOString(), error: String((e as { kind?: string }).kind ?? (e as Error).name ?? "error").slice(0, 100) }).eq("id", runId);
    throw e;
  }
}

/** Runs a claimed day: the Workflows as of that day, as one of the workspace's Owners (the one who asks when an
 * Escalation goes to a Metric's owner), then the due-task reminders. The run's row says how it went. */
export function runClaimedDay(runId: number, workspaceId: string, day: string): Promise<RunCounts> {
  return recorded("workflow_runs", runId, workspaceId, async (owner) => {
    // Its emails are queued for the deliveries job, which sends them within minutes.
    // Workflows with an Asking Schedule run by their own run (runAskingWorkflowsIfDue), not here.
    const log = await runWorkflows(workspaceId, day, owner, { queue: true, scope: "unscheduled" });
    const counts: RunCounts = { ...countsOf(log), reminders: countsOf(log).reminders + (await remindDueTasks(workspaceId, day)) };
    // Automatic Snapshots (spec 0013) of the day: a failing one never fails the Workflows' run.
    try { await takeDueSnapshots(workspaceId, day); } catch { console.error("Automatic Snapshots failed for a workspace"); }
    return counts;
  });
}

/** Claims a Workflow's day for its own run (GLOSSARY: Asking Schedule): the run's id for the one call that may run it,
 * null for every other, and for a Workflow that is not in the workspace. Only a day later than every day it claimed.
 * "saved" records a day as skipped, for a schedule saved after its hour. */
export async function claimAskingDay(workspaceId: string, workflowId: number, day: string, trigger: "schedule" | "manual" | "saved"): Promise<number | null> {
  const { data, error } = await db().rpc("claim_workflow_asking_day", { p_workspace: workspaceId, p_workflow: workflowId, p_day: day, p_trigger: trigger });
  if (error) throw new Error("The run could not be claimed.");
  return (data as number | null) ?? null;
}

/** Runs a claimed day of one Workflow with an Asking Schedule, as one of the workspace's Owners, as the Workspace's run
 * does. The run's row says how it went. A Workflow whose schedule was just added or removed while the Workspace's run
 * is still going could be asked about twice in that moment; the next runs never repeat a step (the period's state). */
export function runClaimedAskingDay(runId: number, workspaceId: string, workflowId: number, day: string): Promise<RunCounts> {
  return recorded("workflow_asking_runs", runId, workspaceId, async (owner) => countsOf(await runWorkflows(workspaceId, day, owner, { queue: true, scope: { workflowId } })));
}

/** A Workflow's new schedule never runs for a day that has begun: when today is a run day and its hour has already
 * come, today is recorded as skipped, so the first run is the next run day. */
export async function skipPassedAskingDay(workspaceId: string, workflowId: number, asking: AskingSchedule, now = new Date()): Promise<void> {
  const { data: w } = await db().from("workspaces").select("time_zone, run_hour").eq("id", workspaceId).maybeSingle();
  if (!w) return;
  const local = localTime(now, String(w.time_zone));
  if (isAskingDay(asking.days, local.day) && local.hour >= askingHour(asking, Number(w.run_hour))) await claimAskingDay(workspaceId, workflowId, local.day, "saved");
}

/** The Workflows of one workspace that run on their own days and hour (GLOSSARY: Asking Schedule): each whose day is a
 * run day and whose hour has come runs once for the day. A failing Workflow does not stop the others. */
export async function runAskingWorkflowsIfDue(workspace: { id: string; time_zone: string; run_hour: number }, now: Date): Promise<{ ran: number; failed: number }> {
  if (workspace.id === DEMO_WORKSPACE_ID) return { ran: 0, failed: 0 };
  const flows = await openWorkflowRows(workspace.id, (await db().from("workflows").select("id, config").eq("workspace_id", workspace.id).order("id")).data);
  const local = localTime(now, workspace.time_zone);
  let ran = 0;
  let failed = 0;
  for (const f of flows ?? []) {
    const asking = (f.config as WorkflowConfig).asking;
    if (!asking || !isAskingDue(asking, workspace.run_hour, local)) continue;
    try {
      const runId = await claimAskingDay(workspace.id, f.id as number, local.day, "schedule");
      if (runId === null) continue;
      await runClaimedAskingDay(runId, workspace.id, f.id as number, local.day);
      ran++;
    } catch {
      failed++;
    }
  }
  return { ran, failed };
}

/** One workspace on one call of the job: runs today's steps if its run hour has come and today is not claimed yet. */
export async function runWorkspaceIfDue(workspace: { id: string; time_zone: string; run_hour: number }, now: Date): Promise<RunOutcome> {
  if (workspace.id === DEMO_WORKSPACE_ID) return "not_yet";
  const { day, hour } = localTime(now, workspace.time_zone);
  if (hour < workspace.run_hour) return "not_yet";
  const runId = await claimDay(workspace.id, day, "schedule");
  if (runId === null) return "already_ran";
  try {
    await runClaimedDay(runId, workspace.id, day);
    return "ran";
  } catch {
    return "failed";
  }
}

/** What the job does on each call: every workspace but the demo whose run hour has come runs today, once, and every
 * Workflow with an Asking Schedule whose day and hour have come runs, once. A failing workspace or Workflow does not
 * stop the others. `only` limits it to some workspaces (tests and tools must not run others). Returns how many
 * workspaces ran and failed, and how many Workflows ran and failed on their own schedule. */
export async function runDueWorkspaces(now: Date = new Date(), only?: string[]): Promise<{ ran: number; failed: number; askingRan: number; askingFailed: number }> {
  let q = db().from("workspaces").select("id, time_zone, run_hour").neq("id", DEMO_WORKSPACE_ID).order("created_at");
  if (only) q = q.in("id", only);
  const { data } = await q;
  let ran = 0;
  let failed = 0;
  let askingRan = 0;
  let askingFailed = 0;
  for (const w of data ?? []) {
    const clock = { id: w.id, time_zone: w.time_zone, run_hour: Number(w.run_hour) };
    const outcome = await runWorkspaceIfDue(clock, now);
    if (outcome === "ran") ran++;
    else if (outcome === "failed") failed++;
    // Whatever goes wrong in one workspace never stops the next.
    const asking = await runAskingWorkflowsIfDue(clock, now).catch(() => ({ ran: 0, failed: 1 }));
    askingRan += asking.ran;
    askingFailed += asking.failed;
  }
  return { ran, failed, askingRan, askingFailed };
}
