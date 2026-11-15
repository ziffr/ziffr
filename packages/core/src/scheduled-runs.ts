// Workflows on a clock (spec 0005, ticket #85; GLOSSARY: Workflow, Due Date, Escalation). A job a scheduler calls
// every hour runs each workspace's Workflows once a day, at its run hour in its own time zone, and reminds people of
// tasks due within two days. Each day is claimed in workflow_runs before anything is sent, so it runs once.
import { addDays, format, parseISO } from "date-fns";
import { db } from "./db";
import { deliver } from "./deliveries";
import { DEMO_WORKSPACE_ID } from "./team";
import { localTime } from "./workspace-clock";
import { runWorkflows } from "./workflow-engine";
import { takeDueSnapshots } from "./auto-snapshots";

/** How a day's run went, counted per Metric: asked for its value, reminded, escalated. */
export type RunCounts = { prompts: number; reminders: number; escalations: number };

/** What became of one workspace on one call: ran, already ran today, not yet its hour, or failed. */
export type RunOutcome = "ran" | "already_ran" | "not_yet" | "failed";

/** Reminds assignees of open tasks due within two days of `day` (GLOSSARY: Due Date); the emails are queued for the
 * deliveries job. Returns how many. */
export async function remindDueTasks(workspaceId: string, day: string): Promise<number> {
  const soon = format(addDays(parseISO(day), 2), "yyyy-MM-dd");
  const { data } = await db().from("actions").select("id, asker_id, assignee_id").eq("workspace_id", workspaceId).eq("kind", "task").eq("status", "open").not("due_date", "is", null).lte("due_date", soon);
  // Queued: the deliveries job sends them, so many reminders never hold the run up on the mail server.
  for (const a of data ?? []) await deliver({ kind: "reminder", actionId: a.id, senderId: a.asker_id, recipientId: a.assignee_id, queue: true });
  return data?.length ?? 0;
}

/** Claims a workspace's day: the run's id for the one call that may run it, null for every other. Only a day later
 * than every day the workspace has claimed: a changed time zone cannot run yesterday or tomorrow, or a day twice. */
export async function claimDay(workspaceId: string, day: string, trigger: "schedule" | "manual"): Promise<number | null> {
  const { data, error } = await db().rpc("claim_workflow_day", { p_workspace: workspaceId, p_day: day, p_trigger: trigger });
  if (error) throw new Error("The run could not be claimed.");
  return (data as number | null) ?? null;
}

/** Runs a claimed day: the Workflows as of that day, as one of the workspace's Owners (the one who asks when an
 * Escalation goes to a Metric's owner), then the due-task reminders. The run's row says how it went. */
export async function runClaimedDay(runId: number, workspaceId: string, day: string): Promise<RunCounts> {
  try {
    const { data: owner } = await db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").order("created_at").limit(1).maybeSingle();
    if (!owner) throw Object.assign(new Error("no owner"), { kind: "no_owner" });
    // Its emails are queued for the deliveries job, which sends them within minutes.
    const log = await runWorkflows(workspaceId, day, owner.user_id as string, { queue: true });
    const counts: RunCounts = {
      prompts: log.filter((l) => /: asked /.test(l)).length,
      reminders: log.filter((l) => /: reminded$/.test(l)).length + (await remindDueTasks(workspaceId, day)),
      escalations: log.filter((l) => /: (asked the stand-in|told the owner)$/.test(l)).length,
    };
    // Automatic Snapshots (spec 0013) of the day: a failing one never fails the Workflows' run.
    try { await takeDueSnapshots(workspaceId, day); } catch { console.error("Automatic Snapshots failed for a workspace"); }
    await db().from("workflow_runs").update({ ...counts, state: "done", finished_at: new Date().toISOString() }).eq("id", runId);
    return counts;
  } catch (e) {
    // Only the kind of failure: the run's details may name people or Metrics.
    await db().from("workflow_runs").update({ state: "failed", finished_at: new Date().toISOString(), error: String((e as { kind?: string }).kind ?? (e as Error).name ?? "error").slice(0, 100) }).eq("id", runId);
    throw e;
  }
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

/** What the job does on each call: every workspace but the demo whose run hour has come runs today, once. A failing
 * workspace does not stop the others. `only` limits it to some workspaces (tests and tools must not run others).
 * Returns how many ran, and how many failed. */
export async function runDueWorkspaces(now: Date = new Date(), only?: string[]): Promise<{ ran: number; failed: number }> {
  let q = db().from("workspaces").select("id, time_zone, run_hour").neq("id", DEMO_WORKSPACE_ID).order("created_at");
  if (only) q = q.in("id", only);
  const { data } = await q;
  let ran = 0;
  let failed = 0;
  for (const w of data ?? []) {
    const outcome = await runWorkspaceIfDue({ id: w.id, time_zone: w.time_zone, run_hour: Number(w.run_hour) }, now);
    if (outcome === "ran") ran++;
    else if (outcome === "failed") failed++;
  }
  return { ran, failed };
}
